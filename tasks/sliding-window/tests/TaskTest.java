import java.util.Arrays;

public final class TaskTest {
    private static int tests;
    private static int failures;
    private static void test(String name, Runnable body) {
        tests++;
        try { body.run(); }
        catch (Throwable error) { failures++; System.err.println("FAIL " + name + ": " + error); }
    }
    private static void decision(Task.Decision actual, boolean allowed, long delay, long... times) {
        if (actual == null || actual.allowed() != allowed || actual.retryAfterMillis() != delay
                || !Arrays.equals(actual.acceptedAt(), times)) {
            throw new AssertionError("Expected allowed=" + allowed + ", delay=" + delay
                    + ", times=" + Arrays.toString(times) + "; got " + actual
                    + (actual == null ? "" : " " + Arrays.toString(actual.acceptedAt())));
        }
    }
    private static void rejects(Runnable body) {
        try { body.run(); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected IllegalArgumentException");
    }
    public static void main(String[] args) {
        test("empty history accepts", () -> decision(Task.admit(new long[]{}, 0, 100, 1), true, 0, 0));
        test("exact lower boundary is expired", () -> decision(Task.admit(new long[]{100}, 200, 100, 1), true, 0, 200));
        test("just inside the boundary blocks for one millisecond", () -> decision(Task.admit(new long[]{101}, 200, 100, 1), false, 1, 101));
        test("old entries disappear from accepted state", () -> decision(Task.admit(new long[]{0, 99, 150}, 200, 100, 2), true, 0, 150, 200));
        test("duplicate timestamps count as separate requests", () -> decision(Task.admit(new long[]{180, 180}, 200, 100, 2), false, 80, 180, 180));
        test("a lowered limit waits for enough expirations", () -> decision(Task.admit(new long[]{100, 150, 170}, 180, 100, 2), false, 70, 100, 150, 170));
        test("limit one waits for the newest historical entry", () -> decision(Task.admit(new long[]{100, 150, 170}, 180, 100, 1), false, 90, 100, 150, 170));
        test("entries at now are active", () -> decision(Task.admit(new long[]{200}, 200, 100, 1), false, 100, 200));
        test("near long maximum uses a relative delay", () -> decision(Task.admit(new long[]{Long.MAX_VALUE - 5}, Long.MAX_VALUE - 2, 10, 1), false, 7, Long.MAX_VALUE - 5));
        test("window larger than elapsed time retains epoch entries", () -> decision(Task.admit(new long[]{0}, 2, Long.MAX_VALUE, 1), false, Long.MAX_VALUE - 2, 0));
        test("input and result do not alias", () -> {
            long[] times = {150};
            Task.Decision denied = Task.admit(times, 180, 100, 1);
            if (denied.acceptedAt() == times) throw new AssertionError("Denied result aliases input");
            denied.acceptedAt()[0] = 99;
            if (times[0] != 150) throw new AssertionError("Input changed");
            Task.Decision accepted = Task.admit(times, 180, 100, 2);
            decision(accepted, true, 0, 150, 180);
            if (times.length != 1 || times[0] != 150) throw new AssertionError("Input changed");
        });
        test("reported delay is both sufficient and minimal", () -> {
            long[] times = {10, 20, 20, 35};
            for (int limit = 1; limit <= 4; limit++) {
                Task.Decision blocked = Task.admit(times, 40, 50, limit);
                if (blocked.allowed() || blocked.retryAfterMillis() <= 0) throw new AssertionError("Expected a positive wait");
                Task.Decision early = Task.admit(times, 40 + blocked.retryAfterMillis() - 1, 50, limit);
                Task.Decision ready = Task.admit(times, 40 + blocked.retryAfterMillis(), 50, limit);
                if (early.allowed() || !ready.allowed()) throw new AssertionError("Retry delay is not the first admissible instant");
            }
        });
        test("invalid scalar input", () -> {
            rejects(() -> Task.admit(null, 10, 10, 1));
            rejects(() -> Task.admit(new long[]{}, -1, 10, 1));
            rejects(() -> Task.admit(new long[]{}, 10, 0, 1));
            rejects(() -> Task.admit(new long[]{}, 10, 10, 0));
        });
        test("invalid history including expired entries", () -> {
            rejects(() -> Task.admit(new long[]{-1, 5}, 10, 2, 1));
            rejects(() -> Task.admit(new long[]{11}, 10, 2, 1));
            rejects(() -> Task.admit(new long[]{2, 1, 9}, 10, 2, 1));
        });
        if (failures != 0) throw new AssertionError(failures + " of " + tests + " cases failed");
        System.out.println("ARENA_TESTS_PASSED=" + tests);
    }
}
