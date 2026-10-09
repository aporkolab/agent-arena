# Make every cent add up

A checkout service divides a nonnegative number of cents between weighted recipients. Independent rounding sometimes creates or loses a cent, and floating-point arithmetic fails on large orders.

Repair `Task.allocate(long cents, long[] weights)` in `src/Task.java`.

## Contract

- Return a new array, one share per input weight, in the original order. Never mutate `weights`.
- Each weight is a nonnegative `long`; at least one must be positive. `cents` can be any nonnegative `long`, including `Long.MAX_VALUE`.
- Compute each ideal share exactly as `cents * weight / sum(weights)`. Start with its floor. Distribute the remaining cents to the largest fractional remainders, one cent per recipient, with ties awarded to the lower original index.
- The weight sum and intermediate multiplication may exceed the range of `long`. Results must remain exact.
- Reject negative cents, null/empty weights, negative weights, and an all-zero weight array with `IllegalArgumentException`.
- Zero cents with valid weights returns an array of zeros. Zero-weight recipients receive zero.

Examples: `allocate(10, [1, 1, 1])` returns `[4, 3, 3]`; `allocate(2, [1, 3, 3])` returns `[0, 1, 1]`.

Only the implementation file is editable. Tests are public; this is an open-test repair task, not a hidden evaluation.
