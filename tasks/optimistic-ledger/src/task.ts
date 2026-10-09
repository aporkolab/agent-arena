export type Adjustment = Readonly<{ token: string; delta: number }>;
export type State = Readonly<{
  base: number;
  pending: readonly Adjustment[];
  settled: readonly string[];
}>;
export type Event =
  | Readonly<{ type: 'adjust'; token: string; delta: number }>
  | Readonly<{ type: 'commit' | 'rollback'; token: string }>;

export function value(state: State): number {
  return state.base + state.pending.reduce((sum, item) => sum + item.delta, 0);
}

export function apply(state: State, event: Event): State {
  if (event.type === 'adjust') {
    if (state.pending.some(item => item.token === event.token)) return state;
    return { ...state, pending: [...state.pending, event] };
  }
  const item = state.pending.find(entry => entry.token === event.token);
  if (!item) return state;
  return {
    base: event.type === 'commit' ? value(state) : state.base,
    pending: [],
    settled: [...state.settled, event.token],
  };
}
