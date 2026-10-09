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
        if (status != 0 && status != 408 && status != 429 && status < 500) {
            return new Decision(false, 0);
        }
        if (attempt > maxAttempts) return new Decision(false, 0);
        long delay = Math.min(maxDelayMillis, baseDelayMillis * (1L << attempt));
        if (retryAfterMillis != null) delay = retryAfterMillis;
        return new Decision(true, delay);
    }
}
