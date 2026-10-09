# Put a ceiling on retries

A synchronous HTTP client asks this pure helper whether to schedule another request after the current attempt. Off-by-one errors and unchecked backoff can make an outage worse.

Repair `Task.decide(int attempt, int maxAttempts, long baseDelayMillis, long maxDelayMillis, int status, Long retryAfterMillis)` in `src/Task.java`. The return type is the existing `Decision(boolean retry, long delayMillis)` record.

## Contract

- `attempt` is the number of the request that just finished, starting at 1. `maxAttempts` includes the initial request. Never retry once `attempt == maxAttempts`.
- Retry only status `0` (transport failure), `408`, `429`, `502`, `503`, or `504`. All other valid HTTP statuses are terminal, including other 5xx statuses.
- For a retry, exponential delay is `baseDelayMillis * 2^(attempt - 1)`, capped at `maxDelayMillis`. Calculate it without overflow, even for large attempt numbers and `long` values. A zero base delay stays zero.
- For statuses `429` and `503` only, a non-null `retryAfterMillis` is a lower bound on the exponential delay; the final result is still capped by `maxDelayMillis`. For other statuses the hint does not affect the result.
- A terminal decision is exactly `Decision(false, 0)`.
- Validate every call before returning, including terminal decisions: `1 <= attempt <= maxAttempts`; both delays nonnegative; status either `0` or `100..599`; any non-null hint nonnegative. Reject violations with `IllegalArgumentException`.
- This helper does not sleep, read a clock, perform a request, add jitter, or parse HTTP headers. A caller has already converted any server hint to milliseconds.

Only the implementation file is editable. All evaluation cases are public.
