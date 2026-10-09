import java.util.Arrays;

public final class Task {
    private Task() {}
    public record Decision(boolean allowed, long retryAfterMillis, long[] acceptedAt) {}

    public static Decision admit(long[] acceptedAt, long now, long windowMillis, int limit) {
        if (acceptedAt == null || now < 0 || windowMillis <= 0 || limit <= 0) {
            throw new IllegalArgumentException("Invalid limiter input");
        }
        long previous = -1;
        for (long timestamp : acceptedAt) {
            if (timestamp < 0 || timestamp > now || timestamp < previous) {
                throw new IllegalArgumentException("Invalid timestamp sequence");
            }
            previous = timestamp;
        }
        int first = 0;
        while (first < acceptedAt.length && now - acceptedAt[first] >= windowMillis) {
            first++;
        }
        long[] active = Arrays.copyOfRange(acceptedAt, first, acceptedAt.length);
        if (active.length >= limit) {
            // Enough entries must expire to leave at most limit - 1 requests.
            long timestamp = active[active.length - limit];
            long delay = windowMillis - (now - timestamp);
            return new Decision(false, delay, active);
        }
        long[] next = Arrays.copyOf(active, active.length + 1);
        next[next.length - 1] = now;
        return new Decision(true, 0, next);
    }
}
