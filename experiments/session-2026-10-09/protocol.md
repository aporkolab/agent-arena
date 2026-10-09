# Session 2026-10-09

This is a recorded workflow demonstration on five small, public coding tasks. It is not a model leaderboard or a statistical benchmark.

## Before the run

The task briefs, deliberately broken sources, trusted tests and expected test counts are frozen before either implementation agent receives them. A SHA-256 manifest is stored with this session. Both implementation agents receive the same task instructions and public tests, with only their output directory differing. Neither receives the other candidate or a reference solution.

## Workflows

- **Solo:** one fresh-context implementation agent repairs all five tasks and may run the public tests. Its submitted candidate is then evaluated without further repair.
- **Reviewed:** a separate fresh-context implementation agent receives the same assignment. After submission, a separate fresh-context reviewer inspects only this candidate and the frozen task suite. The reviewer may repair defects. The implementation snapshot, reviewer feedback and final candidate are retained.

The primary outcome is the number of tasks whose complete trusted test program passes. Every task is retained, including failures, errors and ties. The tests are public. There is no hidden holdout set.

## Recorded measurements

- Workflow wall time spans root dispatch preparation to receipt of the final agent result. It includes tool execution, scheduling, handoff pauses and concurrent publishing work. The dispatch window is recorded explicitly. The reviewed workflow includes its extra review stage. These are observed session durations, not speed comparisons.
- Compile time and test execution time come from the local runner. They are distinct from agent work and workflow wall time.
- Suite, candidate and diff hashes identify the exact evaluated inputs.
- Model identity, token usage and billed cost are not exported by this session's orchestration tools. They are recorded as null, not estimated or represented as zero.

There is one attempt per workflow. The implementations are independently generated, so differences cannot establish a causal benefit of review. Execution order, caches, shared-machine contention and model randomness are uncontrolled. Review edits document what actually changed; they do not prove a general productivity gain.

## Common implementation assignment

Repair all five tasks according to their brief. Read the public sources and tests. Write only the allowed solution files in the assigned candidate directory, preserving each task ID and relative source path. Do not edit task briefs, tests, manifests, the runner or another candidate. Do not inspect other experiment directories or reference solutions. Implement the contracts generally rather than special-casing test inputs. You may run the public evaluator against your own candidate and revise your code before submitting. Do not spawn additional agents. Finish with a short list of changes and observed test outcomes; do not invent performance, token or cost measurements.

## Independent review assignment

Inspect the submitted reviewed-workflow candidate against the frozen task briefs and public tests. Look for contract violations and edge cases. You may modify only its allowlisted solution files and run its evaluator. Do not inspect the solo candidate or change the task suite or runner. Record concrete findings, any changes and the final test outcome. A no-change review is a valid result. Do not spawn additional agents.

## Reproduction boundary

Re-running the repository reproduces compilation and testing of these saved candidates. It does not replay agent generation or reproduce the historical wall times. The runner is not a security sandbox: evaluate code you do not trust only in a disposable isolated environment without credentials or network access.
