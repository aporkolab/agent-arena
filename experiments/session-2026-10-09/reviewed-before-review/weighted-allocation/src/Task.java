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
        if (totalWeight.signum() == 0) throw new IllegalArgumentException("All weights are zero");

        long[] shares = new long[weights.length];
        BigInteger[] remainders = new BigInteger[weights.length];
        Integer[] order = new Integer[weights.length];
        BigInteger amount = BigInteger.valueOf(cents);
        long remaining = cents;
        for (int i = 0; i < weights.length; i++) {
            BigInteger[] parts = amount.multiply(BigInteger.valueOf(weights[i]))
                    .divideAndRemainder(totalWeight);
            shares[i] = parts[0].longValueExact();
            remainders[i] = parts[1];
            order[i] = i;
            remaining -= shares[i];
        }
        Arrays.sort(order, (a, b) -> {
            int remainderOrder = remainders[b].compareTo(remainders[a]);
            return remainderOrder != 0 ? remainderOrder : Integer.compare(a, b);
        });
        // The sum of fractional remainders is an integer smaller than the array length.
        for (int i = 0; i < remaining; i++) {
            shares[order[i]]++;
        }
        return shares;
    }
}
