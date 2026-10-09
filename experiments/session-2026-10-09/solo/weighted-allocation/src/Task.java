import java.math.BigInteger;
import java.util.Arrays;

public final class Task {
    private Task() {}

    public static long[] allocate(long cents, long[] weights) {
        if (cents < 0 || weights == null || weights.length == 0) {
            throw new IllegalArgumentException("Invalid allocation input");
        }
        BigInteger totalWeight = BigInteger.ZERO;
        for (long weight : weights) {
            if (weight < 0) throw new IllegalArgumentException("Negative weight");
            totalWeight = totalWeight.add(BigInteger.valueOf(weight));
        }
        if (totalWeight.signum() == 0) {
            throw new IllegalArgumentException("All weights are zero");
        }

        long[] shares = new long[weights.length];
        if (cents == 0) return shares;
        BigInteger amount = BigInteger.valueOf(cents);
        BigInteger[] remainders = new BigInteger[weights.length];
        Integer[] order = new Integer[weights.length];
        long remaining = cents;
        for (int i = 0; i < weights.length; i++) {
            BigInteger[] quotientAndRemainder = amount.multiply(BigInteger.valueOf(weights[i]))
                    .divideAndRemainder(totalWeight);
            shares[i] = quotientAndRemainder[0].longValueExact();
            remainders[i] = quotientAndRemainder[1];
            remaining -= shares[i];
            order[i] = i;
        }

        // All fractions have the same denominator, so their numerators suffice.
        Arrays.sort(order, (left, right) -> {
            int byRemainder = remainders[right].compareTo(remainders[left]);
            return byRemainder != 0 ? byRemainder : Integer.compare(left, right);
        });
        for (int i = 0; i < remaining; i++) shares[order[i]]++;
        return shares;
    }
}
