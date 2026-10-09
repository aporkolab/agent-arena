# Agent Arena

[![Verify Agent Arena](https://github.com/aporkolab/agent-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/aporkolab/agent-arena/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-7c6bf2)](LICENSE)

**Give the agents the same broken code. Keep the tests. Compare what actually passes.**

A small, local benchmark for coding workflows: one agent working alone, or an implementation followed by an independent review. Five repair tasks cover Java and TypeScript. Candidate solutions are stored as source files, so a result can be rerun and inspected rather than accepted on trust.

[Browse the report](https://aporkolab.github.io/agent-arena/) · [Read the tasks](tasks/) · [Inspect the experiments](experiments/)

## Run it

You need **Node.js 20+**, **JDK 17+** (`java` and `javac`) and npm. TypeScript is installed from the lockfile.

```bash
npm ci
node scripts/arena.mjs list
npm test
npm run baseline
```

The baseline command succeeds only when **every deliberately broken starter compiles and fails its tests**. A compile error is not an acceptable baseline: the task must reach the behavior being tested.

Evaluate a candidate directory:

```bash
node scripts/arena.mjs evaluate \
  --candidate experiments/session-2026-10-09/solo \
  --report reports/solo.json

node scripts/arena.mjs evaluate \
  --candidate experiments/session-2026-10-09/reviewed \
  --report reports/reviewed.json
```

Use `--task <task-id>` to run one task. `list` prints the available IDs; the task metadata specifies which files may be edited.

## Bring another workflow

Create a directory containing the candidate's changes, grouped by task ID. Within each task directory, preserve the editable source file's relative path. For example, if task `java-id` declares `src/Task.java` editable, its replacement belongs at:

```text
my-candidate/java-id/src/Task.java
```

Pass `my-candidate` to `--candidate`. The runner overlays those source files onto the original task and uses the repository's original tests. Keep task definitions, test sources and the runner outside the candidate's edit scope.

For a useful comparison:

1. Start each workflow from the same task snapshot and prompt.
2. Record the actual instructions, model/tool configuration, allowed edits and review process.
3. Preserve the candidate source, then evaluate it with this runner.
4. Publish failures alongside passes. Report what changed after review.

The runner does not call a model or choose a provider. It evaluates source files produced by your workflow. No model API key is needed to reproduce the committed candidates.

## Read the results correctly

| Command / exit code | Meaning |
| :--- | :--- |
| `baseline`: `0` | Every starter compiled and its tests failed as intended. |
| `evaluate`: `0` | Every selected candidate task passed. |
| `evaluate`: `1` | At least one candidate task failed. This is a benchmark result. |
| `evaluate`: `2` | Bad configuration or a runner/setup problem. Do not score this as a model failure. |

The JSON report records the local run. Wall-clock timing measures execution on that machine; it is **not** model generation time, token usage or cost. Task outcomes are evidence about these particular tasks and candidate snapshots, not a general ranking of models or a causal estimate of review effectiveness.

Public tests make this a transparent workflow demonstration. They are not a private holdout set, and a solver can overfit them. Read the code and recorded process as well as the score.

## Execution boundary

The runner compiles and executes candidate code. **It is not a sandbox.** Run unfamiliar candidates inside a disposable container or VM with no credentials, sensitive mounts or unnecessary network access. The checked-in workflows use GitHub-hosted runners, read-only repository permissions and no persisted checkout credentials.

## Automation

CI verifies the runner, checks all broken baselines, then reproduces any committed `solo` and `reviewed` directories for `session-2026-10-09`. A candidate failure remains visible in its JSON report without turning it into an infrastructure failure. Configuration errors fail CI. Reports are retained as workflow artifacts for seven days.

After a successful push verification on `main`, a separate Pages workflow publishes the static report in `docs/`. Pull requests do not deploy. The displayed report is a committed snapshot; new CI runs retain their own artifacts instead of silently rewriting the published experiment.

Action dependencies are pinned to full commit SHAs. Dependabot proposes monthly updates for npm dependencies and GitHub Actions.

## License

MIT, © 2026 Agent Arena contributors. Built by [Porkoláb Ádám](https://github.com/aporkolab) to make agent-assisted development inspectable.
