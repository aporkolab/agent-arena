public final class Task {
    private Task() {}

    public static long[] allocate(long cents, long[] weights) {
        if (cents < 0 || weights == null || weights.length == 0) {
            throw new IllegalArgumentException("Invalid allocation input");
        }
        double totalWeight = 0;
        for (long weight : weights) {
            if (weight < 0) throw new IllegalArgumentException("Negative weight");
            totalWeight += weight;
        }
        if (totalWeight == 0) throw new IllegalArgumentException("All weights are zero");
        long[] shares = new long[weights.length];
        for (int i = 0; i < weights.length; i++) {
            shares[i] = Math.round(cents * (weights[i] / totalWeight));
        }
        return shares;
    }
}
