public final class TaskTest {
    private static int tests;
    private static int failures;
    private static void test(String name, Runnable body) {
        tests++;
        try { body.run(); }
        catch (Throwable error) { failures++; System.err.println("FAIL " + name + ": " + error); }
    }
    private static void decision(Task.Decision actual, boolean retry, long delay) {
        if (actual == null || actual.retry() != retry || actual.delayMillis() != delay) {
            throw new AssertionError("Expected (" + retry + ", " + delay + "), got " + actual);
        }
    }
    private static void rejects(Runnable body) {
        try { body.run(); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected IllegalArgumentException");
    }
    public static void main(String[] args) {
        test("first retry uses the base delay", () -> decision(Task.decide(1, 4, 100, 1000, 503, null), true, 100));
        test("doubling follows completed attempt number", () -> {
            decision(Task.decide(2, 5, 100, 1000, 502, null), true, 200);
            decision(Task.decide(3, 5, 100, 1000, 502, null), true, 400);
            decision(Task.decide(4, 5, 100, 1000, 502, null), true, 800);
        });
        test("last permitted attempt never retries", () -> decision(Task.decide(4, 4, 100, 1000, 503, 500L), false, 0));
        test("a single-attempt policy never retries", () -> decision(Task.decide(1, 1, 100, 1000, 0, null), false, 0));
        test("only documented statuses retry", () -> {
            for (int status : new int[]{0, 408, 429, 502, 503, 504}) {
                decision(Task.decide(1, 2, 1, 10, status, null), true, 1);
            }
            for (int status : new int[]{100, 200, 301, 400, 401, 404, 409, 500, 501, 505, 599}) {
                decision(Task.decide(1, 2, 1, 10, status, null), false, 0);
            }
        });
        test("ordinary exponential delay is capped", () -> decision(Task.decide(9, 10, 100, 1000, 504, null), true, 1000));
        test("server hint raises a small delay", () -> {
            decision(Task.decide(1, 3, 100, 1000, 429, 450L), true, 450);
            decision(Task.decide(1, 3, 100, 1000, 503, 450L), true, 450);
        });
        test("server hint does not lower exponential delay", () -> decision(Task.decide(3, 4, 100, 1000, 429, 50L), true, 400));
        test("server hint cannot exceed the cap", () -> decision(Task.decide(1, 3, 100, 1000, 503, Long.MAX_VALUE), true, 1000));
        test("other retryable statuses ignore the hint", () -> {
            for (int status : new int[]{0, 408, 502, 504}) decision(Task.decide(1, 3, 100, 1000, status, 900L), true, 100);
        });
        test("multiplication overflow saturates", () -> decision(Task.decide(2, 3, Long.MAX_VALUE / 2 + 1, Long.MAX_VALUE, 503, null), true, Long.MAX_VALUE));
        test("large exponents do not wrap a bit shift", () -> {
            decision(Task.decide(65, 66, 1, 1000, 503, null), true, 1000);
            decision(Task.decide(Integer.MAX_VALUE - 1, Integer.MAX_VALUE, 1, Long.MAX_VALUE, 503, null), true, Long.MAX_VALUE);
        });
        test("zero base and zero cap", () -> {
            decision(Task.decide(100, 101, 0, 1000, 502, null), true, 0);
            decision(Task.decide(1, 2, 100, 0, 429, 500L), true, 0);
            decision(Task.decide(1, 2, 0, 1000, 429, 500L), true, 500);
        });
        test("base above cap and exact long limits", () -> {
            decision(Task.decide(1, 2, 1000, 10, 502, null), true, 10);
            decision(Task.decide(1, 2, Long.MAX_VALUE, Long.MAX_VALUE, 502, null), true, Long.MAX_VALUE);
        });
        test("invalid attempt bounds", () -> {
            rejects(() -> Task.decide(0, 2, 1, 10, 200, null));
            rejects(() -> Task.decide(1, 0, 1, 10, 200, null));
            rejects(() -> Task.decide(3, 2, 1, 10, 200, null));
        });
        test("negative delays rejected even on terminal response", () -> {
            rejects(() -> Task.decide(1, 1, -1, 10, 200, null));
            rejects(() -> Task.decide(1, 1, 1, -1, 200, null));
            rejects(() -> Task.decide(1, 1, 1, 10, 200, -1L));
        });
        test("invalid HTTP status", () -> {
            for (int status : new int[]{-1, 1, 99, 600}) {
                rejects(() -> Task.decide(1, 2, 1, 10, status, null));
            }
        });
        if (failures != 0) throw new AssertionError(failures + " of " + tests + " cases failed");
        System.out.println("ARENA_TESTS_PASSED=" + tests);
    }
}
