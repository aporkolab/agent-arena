public final class Task {
    private Task() {}
    public record Decision(boolean retry, long delayMillis) {}

    public static Decision decide(int attempt, int maxAttempts, long baseDelayMillis,
                                  long maxDelayMillis, int status, Long retryAfterMillis) {
        if (attempt < 1 || maxAttempts < 1 || attempt > maxAttempts
                || baseDelayMillis < 0 || maxDelayMillis < 0
                || (status != 0 && (status < 100 || status > 599))
                || (retryAfterMillis != null && retryAfterMillis < 0)) {
            throw new IllegalArgumentException("Invalid retry input");
        }
        boolean retryable = status == 0 || status == 408 || status == 429
                || status == 502 || status == 503 || status == 504;
        if (attempt == maxAttempts || !retryable) return new Decision(false, 0);

        long delay = Math.min(baseDelayMillis, maxDelayMillis);
        int doublings = attempt - 1;
        // A positive delay reaches the cap within 63 doublings at most.
        while (doublings > 0 && delay > 0 && delay < maxDelayMillis) {
            delay = delay > maxDelayMillis / 2 ? maxDelayMillis : delay * 2;
            doublings--;
        }
        if ((status == 429 || status == 503) && retryAfterMillis != null) {
            delay = Math.min(maxDelayMillis, Math.max(delay, retryAfterMillis));
        }
        return new Decision(true, delay);
    }
}
