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
  if (state.settled.includes(event.token)) return state;
  const index = state.pending.findIndex(item => item.token === event.token);
  if (event.type === 'adjust') {
    if (index !== -1) return state;
    return {
      ...state,
      pending: [...state.pending, { token: event.token, delta: event.delta }],
    };
  }
  if (index === -1) return state;
  return {
    base: event.type === 'commit' ? state.base + state.pending[index].delta : state.base,
    pending: [...state.pending.slice(0, index), ...state.pending.slice(index + 1)],
    settled: [...state.settled, event.token],
  };
}
