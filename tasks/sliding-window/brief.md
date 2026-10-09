# Repair the rate-limit boundary

An in-memory limiter stores timestamps of accepted requests. Operators can lower the limit while requests are still in the window. Clients need a precise retry delay.

Repair `Task.admit(long[] acceptedAt, long now, long windowMillis, int limit)` in `src/Task.java`, preserving its `Decision(boolean allowed, long retryAfterMillis, long[] acceptedAt)` record.

## Contract

- All times are caller-provided nonnegative integer milliseconds. Do not read a clock or retain global state.
- Input timestamps are sorted in nondecreasing order, may repeat, and must not be in the future. Validate the entire input, including entries that will expire.
- The active interval is **`(now - windowMillis, now]`**. A timestamp exactly one window old is expired.
- Remove expired entries. If fewer than `limit` active entries remain, accept the request, append `now`, and return retry delay `0`.
- Otherwise reject without appending. Return the smallest positive delay after which this request would be accepted if no other request arrives. When historical active entries exceed a newly lowered limit, enough entries must expire to leave fewer than `limit` entries.
- The returned timestamp array contains only the retained active entries, plus the new request when accepted. Always return a fresh array and never mutate the input.
- `now` and `windowMillis` may reach `Long.MAX_VALUE`; compute the relative retry delay without overflowing an absolute expiry timestamp.
- Reject a null array, negative `now`, nonpositive window or limit, negative/future timestamps, or unsorted timestamps with `IllegalArgumentException`.

Example: timestamps `[100, 150, 170]`, `now=180`, `windowMillis=100`, `limit=2` must reject with delay `70`, because two entries must expire before another request can fit.

Only the implementation file is editable. All evaluation cases are public.
