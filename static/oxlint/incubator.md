# Lint incubator spike

The incubator permits existing violations and fails when a file's count for an
incubating rule exceeds its committed ceiling. The initial tenant is `eslint/no-void`,
chosen to exercise the mechanism against a small real backlog. This spike does not
propose enabling that rule permanently.

```sh
pnpm lint:incubator
pnpm lint:incubator --base origin/master --json
node scripts/lint-incubator.ts backlog --rule eslint/no-void > /tmp/backlog.json
node scripts/lint-incubator.ts backlog --file static/path/to/file.tsx
pnpm gen:incubator-baseline --update
pnpm test:incubator
```

`backlog` runs the linter and emits current file paths, rule IDs, locations, messages,
documentation URLs, and help text. Its JSON can be handed to an agent. The PR workflow
also publishes `incubator-backlog.json` and `incubator-check.json` as an Actions artifact.
The baseline stores message hashes with multiplicity but no source locations.

`generate` enrolls the current full tree. Use it only to onboard a reviewed rule or
reconcile a move Git cannot detect. `generate --update` first checks all ceilings and
refuses any increase. Entries that reach zero disappear. The nightly workflow opens a
PR with this update. An unchanged scan does not rewrite the file. Humans merge the
baseline PR. GitHub must permit Actions to create pull requests; PRs created with
`GITHUB_TOKEN` need a human or another token to trigger subsequent PR workflows.

The schedule runs at 06:00 UTC. Generating a PR does not change the enforced ceiling;
merging it does. Require branches to be up to date before merging so older green
checks cannot outlive a baseline change. An updated PR is checked against the current
base branch and fails if it restores debt already removed there. A baseline PR that
becomes stale must also update and rerun before merging. CI also checks against any
lower ceiling proposed in the PR itself, so a stale shrink PR cannot merge a baseline
that is below the actual source count.

CI reads the baseline from the merge commit's first parent and scans the whole
`static/` tree, including any `gsApp` and `gsAdmin` directories present in the checkout.
Git-detected renames transfer ceilings once. Copies receive no allowance. Missing
entries allow zero violations. Increasing the PR's baseline does not waive a failure,
and increases in the baseline itself fail independently. Existing CODEOWNERS coverage
for `/static/oxlint/` assigns baseline review to design-engineering.

The dedicated config inherits the main config's ignore patterns and enables only
the incubating rule. A native rule needs one entry in `incubatorRules`. A JS plugin
also needs registration in the dedicated config. Adding a rule requires a reviewed
baseline rollout before making its check required. Graduation also requires a reviewed
rollout because the spike rejects mismatched base/config rule sets. Move a zero-debt
rule into the normal config before retiring its incubator check and baseline entry.

## Limits being tested

- Counts permit replacing one violation with another within the same file and rule.
- Hashes help attribute excess diagnostics, but identical messages and identifier
  changes cannot prove which occurrence is new. Reports show only the excess count,
  using later source positions when attribution is ambiguous. A new occurrence near
  the top of a file can therefore cause an older occurrence to be displayed.
- Cleanup only becomes enforced after its lower baseline merges. Deleted and renamed
  files can retain unused old-path allowances until the next baseline update.
- Full-tree scans favor correctness and a simple spike over selective CI scope.
- Workflow, config, and script changes remain subject to review. A trusted baseline
  does not make execution of PR-controlled code tamper-proof. The PR job has read-only
  permissions and does not retain checkout credentials.
- The spike uses Actions annotations and artifacts instead of a PR-comment bot.
  A failed job blocks merging only when configured as a required check.

The implementation keeps oxlint invocation, input validation, grouping, and CLI
commands in one script. A separate JSON postprocessor was considered, but would
repeat scan arguments and exit handling in every caller. One real-oxlint integration
test exercises existing debt, growth, swaps, renames, cleanup, reinsertion, malformed
source, malformed baselines, and baseline inflation.

## Fork verification

The spike runs in [natemoo-re/sentry](https://github.com/natemoo-re/sentry). Its `main`
branch retains only the two incubator workflows and requires the `Lint incubator`
check, including for administrators. The implementation branch
`nm/spike/lint-incubator` preserves the upstream workflows.

Observed Actions results on September 24, 2026:

| Scenario                                          | Result                          | Evidence                                                                                                                  |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shift lines in a file with existing debt          | Pass, 101 violations remain     | [PR 1](https://github.com/natemoo-re/sentry/pull/1), [run](https://github.com/natemoo-re/sentry/actions/runs/36049088976) |
| Add a violation to an existing file               | Fail, one excess; merge blocked | [PR 2](https://github.com/natemoo-re/sentry/pull/2), [run](https://github.com/natemoo-re/sentry/actions/runs/36049089089) |
| Add a new violating file                          | Fail, one excess                | [PR 3](https://github.com/natemoo-re/sentry/pull/3), [run](https://github.com/natemoo-re/sentry/actions/runs/36049092734) |
| Rename a file with debt                           | Pass, allowance transferred     | [PR 4](https://github.com/natemoo-re/sentry/pull/4), [run](https://github.com/natemoo-re/sentry/actions/runs/36049099054) |
| Fix one backlog item                              | Pass, live backlog drops to 100 | [PR 5](https://github.com/natemoo-re/sentry/pull/5), [run](https://github.com/natemoo-re/sentry/actions/runs/36049102137) |
| Increase a baseline entry without changing source | Fail, one inflated entry        | [PR 6](https://github.com/natemoo-re/sentry/pull/6), [run](https://github.com/natemoo-re/sentry/actions/runs/36049106060) |

Each run's `lint-incubator` artifact contains the machine-readable check report and
live backlog. The deliberately failing PRs are test specimens, not changes to merge.
