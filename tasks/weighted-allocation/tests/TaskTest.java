import java.math.BigInteger;
import java.util.Arrays;

public final class TaskTest {
    private static int tests;
    private static int failures;

    private static void test(String name, Runnable body) {
        tests++;
        try { body.run(); }
        catch (Throwable error) {
            failures++;
            System.err.println("FAIL " + name + ": " + error);
        }
    }
    private static void equal(long[] actual, long... expected) {
        if (!Arrays.equals(actual, expected)) {
            throw new AssertionError("Expected " + Arrays.toString(expected)
                    + ", got " + Arrays.toString(actual));
        }
    }
    private static void rejects(Runnable body) {
        try { body.run(); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected IllegalArgumentException");
    }
    public static void main(String[] args) {
        test("equal weights retain all cents", () -> equal(Task.allocate(10, new long[]{1, 1, 1}), 4, 3, 3));
        test("independent rounding must not create a cent", () -> equal(Task.allocate(2, new long[]{1, 1, 1}), 1, 1, 0));
        test("larger remainders outrank array order", () -> equal(Task.allocate(2, new long[]{1, 3, 3}), 0, 1, 1));
        test("remainder ordering with unequal quotients", () -> equal(Task.allocate(17, new long[]{5, 2, 1}), 11, 4, 2));
        test("zero weight is not awarded a remainder", () -> equal(Task.allocate(1, new long[]{0, 1, 1}), 0, 1, 0));
        test("zero cents", () -> equal(Task.allocate(0, new long[]{0, Long.MAX_VALUE, 1}), 0, 0, 0));
        test("one recipient receives the exact long maximum", () -> equal(Task.allocate(Long.MAX_VALUE, new long[]{7}), Long.MAX_VALUE));
        test("odd long maximum splits exactly", () -> equal(Task.allocate(Long.MAX_VALUE, new long[]{1, 1}), 4_611_686_018_427_387_904L, 4_611_686_018_427_387_903L));
        test("weight sum may overflow a long", () -> equal(Task.allocate(3, new long[]{Long.MAX_VALUE, Long.MAX_VALUE}), 2, 1));
        test("adjacent huge weights remain distinct", () -> equal(Task.allocate(1, new long[]{Long.MAX_VALUE - 1, Long.MAX_VALUE}), 0, 1));
        test("input is preserved and output is independent", () -> {
            long[] weights = {2, 3, 4};
            long[] original = weights.clone();
            long[] result = Task.allocate(9, weights);
            equal(weights, original);
            equal(result, 2, 3, 4);
            if (result == weights) throw new AssertionError("Output aliases input");
        });
        test("reject invalid amount and empty inputs", () -> {
            rejects(() -> Task.allocate(-1, new long[]{1}));
            rejects(() -> Task.allocate(1, null));
            rejects(() -> Task.allocate(1, new long[]{}));
        });
        test("reject negative and all-zero weights", () -> {
            rejects(() -> Task.allocate(0, new long[]{-1, 2}));
            rejects(() -> Task.allocate(1, new long[]{0, 0}));
        });
        test("conservation across a deterministic input grid", () -> {
            for (int cents = 0; cents < 80; cents++) {
                for (int a = 0; a < 7; a++) {
                    long[] weights = {a, 7 - a, 3, 0};
                    long[] shares = Task.allocate(cents, weights);
                    if (shares.length != weights.length) throw new AssertionError("Wrong output length");
                    BigInteger sum = BigInteger.ZERO;
                    for (long share : shares) {
                        if (share < 0) throw new AssertionError("Negative share");
                        sum = sum.add(BigInteger.valueOf(share));
                    }
                    if (!sum.equals(BigInteger.valueOf(cents))) throw new AssertionError("Lost or created cents");
                    if (shares[3] != 0) throw new AssertionError("Zero-weight recipient paid");
                }
            }
        });
        test("scaling weights does not change the allocation", () -> {
            for (int cents = 1; cents < 40; cents++) {
                equal(Task.allocate(cents, new long[]{2, 5, 7}), Task.allocate(cents, new long[]{2_000_000_000L, 5_000_000_000L, 7_000_000_000L}));
            }
        });
        if (failures != 0) throw new AssertionError(failures + " of " + tests + " cases failed");
        System.out.println("ARENA_TESTS_PASSED=" + tests);
    }
}
