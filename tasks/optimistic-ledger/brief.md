# Roll back only your own optimistic update

A frontend displays a counter immediately after an adjustment, before the server confirms it. Several updates can be pending together. Rejecting one must not erase the others, and duplicate acknowledgements must be harmless.

Repair `apply(state, event)` and `value(state)` in `src/task.ts`, preserving their exported types and signatures. This is a pure TypeScript state helper, with no framework or network dependency.

## Contract

- `base` contains only committed adjustments. `pending` is the ordered list of unacknowledged `{token, delta}` entries. `settled` records tokens already committed or rolled back.
- The displayed `value` is `base + sum(pending.delta)`.
- An `adjust` with a new token appends exactly one entry to pending. It does not change base or settled. A token already pending or settled is an identity no-op, even if the repeated delta differs.
- `commit` moves only the matching pending entry's delta into base, removes only that entry, and appends its token to settled.
- `rollback` removes only the matching pending entry, leaves base unchanged, and appends its token to settled.
- Commit and rollback may arrive in any order. Settling an unknown or previously settled token returns the original state by identity.
- An accepted event returns a new state. Preserve the order of remaining pending entries and existing settled tokens. Never mutate input state, nested entries, arrays, or events. Accepted adjustments must snapshot their event fields rather than retaining a mutable event object.
- `base` and deltas may be negative or zero. Tokens are nonempty strings. Inputs are well-formed, and all sums are safe integers; validation of malformed inputs is outside this task.
- The caller owns retention of settled tokens. This helper must not evict them or use module-level memory.

Example: base `10`, pending `A:+5, B:+2`; rollback A leaves displayed value `12`. Committing B then produces base `12`, no pending entries, and settled tokens `[A, B]`.

Only the implementation file is editable. All evaluation cases are public.
