export type State = Readonly<{
  requestId: number;
  query: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  items: readonly string[];
  error: string | null;
}>;

export type Event =
  | Readonly<{ type: 'start'; requestId: number; query: string }>
  | Readonly<{ type: 'success'; requestId: number; items: readonly string[] }>
  | Readonly<{ type: 'failure'; requestId: number; error: string }>;

export const initialState: State = {
  requestId: 0, query: '', status: 'idle', items: [], error: null,
};

export function reduce(state: State, event: Event): State {
  if (!Number.isSafeInteger(event.requestId) || event.requestId <= 0) {
    throw new RangeError('Invalid request ID');
  }
  if (event.type === 'start') {
    if (event.requestId <= state.requestId) return state;
    return { ...state, requestId: event.requestId, query: event.query, status: 'loading', error: null };
  }
  if (event.requestId !== state.requestId || state.status !== 'loading') return state;
  if (event.type === 'success') {
    return { ...state, items: [...event.items], status: 'success', error: null };
  }
  return { ...state, status: 'error', error: event.error };
}
