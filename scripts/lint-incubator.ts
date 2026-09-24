import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';

import {z} from 'zod';

import {incubatorRules} from '../oxlint.config.incubator.ts';

const baselinePath = 'static/oxlint/incubator.baseline.json';
const rules = Object.keys(incubatorRules).sort();
const messageSchema = z.object({hash: z.string(), message: z.string()});
const entrySchema = z
  .object({count: z.number().int().nonnegative(), messages: z.array(messageSchema)})
  .refine(entry => entry.count === entry.messages.length);
const baselineSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  generatedFrom: z.string(),
  rules: z.array(z.string()),
  files: z.record(z.string(), z.record(z.string(), entrySchema)),
});
type Baseline = z.infer<typeof baselineSchema>;
type Finding = {
  column: number;
  file: string;
  hash: string;
  line: number;
  message: string;
  rule: string;
  help?: string;
  url?: string;
};
const reportSchema = z.object({
  number_of_files: z.number().positive(),
  diagnostics: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      filename: z.string().min(1),
      url: z.string().optional(),
      help: z.string().optional(),
      labels: z
        .array(
          z.object({
            span: z.object({line: z.number().positive(), column: z.number().positive()}),
          })
        )
        .nonempty(),
    })
  ),
});

function git(...args: string[]): string {
  const result = spawnSync('git', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || 'git failed');
  }
  return result.stdout.trimEnd();
}

function scan(): Finding[] {
  const result = spawnSync(
    'node_modules/.bin/oxlint',
    [
      '-c',
      'oxlint.config.incubator.ts',
      '--disable-nested-config',
      '--format',
      'json',
      'static',
    ],
    {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || result.error?.message || 'oxlint failed');
  }
  const report = reportSchema.parse(JSON.parse(result.stdout));
  if (result.status === 1 && report.diagnostics.length === 0) {
    throw new Error('oxlint failed without diagnostics');
  }
  return report.diagnostics
    .map(diagnostic => {
      const rule = diagnostic.code.replace(/^(.+)\((.+)\)$/, '$1/$2');
      if (!rules.includes(rule)) {
        throw new Error(
          `Unexpected oxlint diagnostic: ${diagnostic.code}: ${diagnostic.message}`
        );
      }
      const message = diagnostic.message.replace(/\s+/g, ' ').trim();
      return {
        file: diagnostic.filename,
        rule,
        message,
        hash: createHash('sha256').update(message).digest('hex').slice(0, 16),
        line: diagnostic.labels[0]!.span.line,
        column: diagnostic.labels[0]!.span.column,
        url: diagnostic.url,
        help: diagnostic.help,
      };
    })
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.rule.localeCompare(b.rule) ||
        a.line - b.line ||
        a.column - b.column
    );
}

function snapshot(findings: Finding[]): Baseline {
  const files: Baseline['files'] = {};
  for (const finding of findings) {
    const file = (files[finding.file] ??= {});
    const entry = (file[finding.rule] ??= {count: 0, messages: []});
    entry.count++;
    entry.messages.push({hash: finding.hash, message: finding.message});
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedFrom: git('rev-parse', 'HEAD'),
    rules,
    files,
  };
}

function readBaseline(text: string): Baseline {
  const baseline = baselineSchema.parse(JSON.parse(text));
  if (JSON.stringify([...baseline.rules].sort()) !== JSON.stringify(rules)) {
    throw new Error(
      'Baseline rules differ from incubator config. Rule onboarding requires a reviewed baseline.'
    );
  }
  for (const entries of Object.values(baseline.files)) {
    if (Object.keys(entries).some(rule => !rules.includes(rule))) {
      throw new Error('Baseline contains an unregistered rule');
    }
  }
  return baseline;
}

function baseBaseline(ref: string) {
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
  const baseline = readBaseline(git('show', `${sha}:${baselinePath}`));
  const fields = git(
    'diff',
    '--name-status',
    '-z',
    '-M',
    sha,
    'HEAD',
    '--',
    'static'
  ).split('\0');
  const original = structuredClone(baseline);
  baseline.files = {...original.files};
  const renames: Array<[string, string]> = [];
  for (let i = 0; i < fields.length - 1;) {
    const status = fields[i++]!;
    const from = fields[i++]!;
    if (status.startsWith('R')) {
      renames.push([from, fields[i++]!]);
    }
  }
  for (const [from] of renames) {
    delete baseline.files[from];
  }
  for (const [from, to] of renames) {
    if (original.files[from]) {
      baseline.files[to] = original.files[from];
    }
  }
  return {baseline, original, renames};
}

function increases(actual: Baseline, baseline: Baseline) {
  return Object.entries(actual.files).flatMap(([file, entries]) =>
    Object.entries(entries).flatMap(([rule, entry]) => {
      const allowed = baseline.files[file]?.[rule]?.count ?? 0;
      return entry.count > allowed
        ? [{file, rule, baseline: allowed, actual: entry.count}]
        : [];
    })
  );
}

function excess(findings: Finding[], baseline: Baseline) {
  return increases(snapshot(findings), baseline).map(group => {
    const matching = findings.filter(
      finding => finding.file === group.file && finding.rule === group.rule
    );
    const hashes = new Map<string, number>();
    for (const {hash} of baseline.files[group.file]?.[group.rule]?.messages ?? []) {
      hashes.set(hash, (hashes.get(hash) ?? 0) + 1);
    }
    const unmatched = matching.filter(finding => {
      const remaining = hashes.get(finding.hash) ?? 0;
      if (remaining > 0) {
        hashes.set(finding.hash, remaining - 1);
        return false;
      }
      return true;
    });
    const count = group.actual - group.baseline;
    return {
      ...group,
      attribution: 'message multiset; identical messages use source order',
      diagnostics: unmatched.slice(-count),
    };
  });
}

function emit(value: unknown, json: boolean) {
  process.stdout.write(`${json ? JSON.stringify(value, null, 2) : value}\n`);
}

function main() {
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      base: {type: 'string'},
      json: {type: 'boolean'},
      update: {type: 'boolean'},
      rule: {type: 'string'},
      file: {type: 'string'},
    },
  });
  const [command] = positionals;
  if (
    positionals.length !== 1 ||
    !['check', 'generate', 'backlog'].includes(command ?? '')
  ) {
    throw new Error(
      'Usage: lint-incubator.ts check [--base REF] [--json] | generate [--update] [--base REF] | backlog [--rule RULE] [--file PATH]'
    );
  }
  if (
    (values.update && command !== 'generate') ||
    ((values.rule || values.file) && command !== 'backlog')
  ) {
    throw new Error('Filters only apply to backlog; --update only applies to generate');
  }
  const findings = scan();
  if (command === 'backlog') {
    if (values.rule && !rules.includes(values.rule)) {
      throw new Error(`Unknown incubator rule: ${values.rule}`);
    }
    const diagnostics = findings.filter(
      finding =>
        (!values.rule || finding.rule === values.rule) &&
        (!values.file || finding.file === values.file)
    );
    emit(
      {
        version: 1,
        generatedFrom: git('rev-parse', 'HEAD'),
        total: diagnostics.length,
        diagnostics,
      },
      true
    );
    return;
  }
  const actual = snapshot(findings);
  if (command === 'generate' && !values.update) {
    writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
    emit(
      `Generated baseline with ${findings.length} violations. Baseline enrollment requires review.`,
      false
    );
    return;
  }
  const base = values.base ? baseBaseline(values.base) : undefined;
  const baseline = base?.baseline ?? readBaseline(readFileSync(baselinePath, 'utf8'));
  const violations = excess(findings, baseline);
  const headBaseline = readBaseline(readFileSync(baselinePath, 'utf8'));
  const baselineIncreases = base
    ? increases(headBaseline, base.original).filter(
        group => group.actual > (baseline.files[group.file]?.[group.rule]?.count ?? 0)
      )
    : [];
  if (command === 'generate') {
    const current = structuredClone(headBaseline);
    for (const [from, to] of base?.renames ?? []) {
      if (!current.files[to] && headBaseline.files[from]) {
        current.files[to] = headBaseline.files[from];
      }
    }
    if (violations.length || increases(actual, current).length) {
      throw new Error(
        'Refusing to increase baseline ceilings. Run check for the new violations.'
      );
    }
    if (JSON.stringify(actual.files) !== JSON.stringify(headBaseline.files)) {
      writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
    }
    emit(`Baseline now has ${findings.length} violations. No ceiling increased.`, false);
    return;
  }
  const total = violations.reduce((sum, group) => sum + group.actual - group.baseline, 0);
  const report = {version: 1, total, baselineIncreases, violations};
  if (values.json) {
    emit(report, true);
  } else {
    emit(
      `lint-incubator: ${total} excess violations; ${baselineIncreases.length} increased baseline entries`,
      false
    );
    for (const group of violations) {
      emit(
        `${group.file}: ${group.rule} (baseline ${group.baseline}, now ${group.actual})`,
        false
      );
      for (const finding of group.diagnostics) {
        emit(
          `  ${finding.line}:${finding.column} ${finding.message}\n  ${finding.url ?? ''}\n  ${finding.help ?? ''}`,
          false
        );
      }
    }
    for (const group of baselineIncreases) {
      emit(
        `Baseline inflation: ${group.file} ${group.rule} (${group.baseline} -> ${group.actual})`,
        false
      );
    }
  }
  process.exitCode = total || baselineIncreases.length ? 1 : 0;
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `lint-incubator: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 2;
}
