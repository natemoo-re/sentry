import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';

test('incubator enforces ceilings with real oxlint and git', () => {
  const root = resolve(import.meta.dirname, '..');
  const cwd = mkdtempSync(join(tmpdir(), 'lint-incubator-'));
  function run(command: string, args: string[], expected = 0) {
    const result = spawnSync(command, args, {cwd, encoding: 'utf8'});
    assert.equal(result.status, expected, result.stderr || result.stdout);
    return result.stdout;
  }
  function cli(args: string[], expected = 0) {
    return run(
      process.execPath,
      [join(root, 'scripts/lint-incubator.ts'), ...args],
      expected
    );
  }
  function commit() {
    run('git', ['add', 'static']);
    run('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Fixture']);
    return run('git', ['rev-parse', 'HEAD']).trim();
  }
  function source(text: string) {
    writeFileSync(join(cwd, 'static/example.ts'), text);
  }
  try {
    mkdirSync(join(cwd, 'static/oxlint'), {recursive: true});
    symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'));
    symlinkSync(
      join(root, 'oxlint.config.incubator.ts'),
      join(cwd, 'oxlint.config.incubator.ts')
    );
    run('git', ['init', '-q']);
    run('git', ['config', 'user.name', 'Incubator test']);
    run('git', ['config', 'user.email', 'incubator@example.com']);
    run('git', ['config', 'commit.gpgsign', 'false']);
    source('void first();\n');
    commit();
    cli(['generate']);
    const base = commit();
    cli(['check', '--base', base]);
    source('\n\nvoid first();\n');
    cli(['check', '--base', base]);
    source('void first();\nvoid second();\n');
    const failure = JSON.parse(cli(['check', '--base', base, '--json'], 1));
    assert.equal(failure.total, 1);
    assert.equal(failure.violations[0].diagnostics.length, 1);
    const backlog = JSON.parse(cli(['backlog', '--file', 'static/example.ts']));
    assert.equal(backlog.total, 2);
    assert.equal(backlog.diagnostics[1].line, 2);
    cli(['generate', '--update', '--base', base], 2);
    cli(['generate']);
    assert.equal(
      JSON.parse(cli(['check', '--base', base, '--json'], 1)).baselineIncreases.length,
      1
    );
    run('git', ['restore', 'static/oxlint/incubator.baseline.json']);
    source('void replacement();\n');
    cli(['check', '--base', base]);
    source('void first();\n');
    run('git', ['mv', 'static/example.ts', 'static/renamed.ts']);
    commit();
    cli(['check', '--base', base]);
    cli(['generate', '--update', '--base', base]);
    const renamed = JSON.parse(
      readFileSync(join(cwd, 'static/oxlint/incubator.baseline.json'), 'utf8')
    );
    assert.equal(renamed.files['static/renamed.ts']['eslint/no-void'].count, 1);
    assert.equal(renamed.files['static/example.ts'], undefined);
    const renamedBase = commit();
    writeFileSync(join(cwd, 'static/renamed.ts'), 'first();\n');
    cli(['generate', '--update', '--base', renamedBase]);
    const shrunk = JSON.parse(
      readFileSync(join(cwd, 'static/oxlint/incubator.baseline.json'), 'utf8')
    );
    assert.deepEqual(shrunk.files, {});
    writeFileSync(join(cwd, 'static/renamed.ts'), 'void first();\n');
    cli(['check', '--base', renamedBase], 1);
    cli(['generate', '--update', '--base', renamedBase], 2);
    writeFileSync(join(cwd, 'static/renamed.ts'), 'first();\n');
    const shrunkBase = commit();
    writeFileSync(join(cwd, 'static/renamed.ts'), 'void first();\n');
    cli(['check', '--base', shrunkBase], 1);
    source('void newFile();\n');
    assert.equal(JSON.parse(cli(['check', '--base', shrunkBase, '--json'], 1)).total, 2);
    source('const = invalid;\n');
    cli(['check'], 2);
    source('first();\n');
    writeFileSync(join(cwd, 'static/oxlint/incubator.baseline.json'), '{"version":1}');
    cli(['check'], 2);
  } finally {
    rmSync(cwd, {recursive: true, force: true});
  }
});
