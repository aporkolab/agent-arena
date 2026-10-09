import assert from 'node:assert/strict';
import { initialState, reduce, type State, type Event } from '../src/task';

let tests = 0;
let failures = 0;
function test(name: string, body: () => void): void {
  tests++;
  try { body(); }
  catch (error) { failures++; console.error(`FAIL ${name}:`, error); }
}
function loading(id = 1): State {
  return reduce(initialState, { type: 'start', requestId: id, query: 'robot' });
}
test('initial state has no active request', () => {
  assert.deepEqual(initialState, { requestId: 0, query: '', status: 'idle', items: [], error: null });
});
test('start keeps previous items and clears the previous error', () => {
  const before: State = { requestId: 2, query: 'old', status: 'error', items: ['old result'], error: 'offline' };
  const after = reduce(before, { type: 'start', requestId: 3, query: ' next ' });
  assert.deepEqual(after, { requestId: 3, query: ' next ', status: 'loading', items: ['old result'], error: null });
  assert.notEqual(after, before);
});
test('a repeated or older start is an identity no-op', () => {
  const state = loading(5);
  assert.equal(reduce(state, { type: 'start', requestId: 5, query: 'duplicate' }), state);
  assert.equal(reduce(state, { type: 'start', requestId: 4, query: 'older' }), state);
});
test('current success completes the request', () => {
  const state = loading();
  const after = reduce(state, { type: 'success', requestId: 1, items: ['bot'] });
  assert.deepEqual(after, { requestId: 1, query: 'robot', status: 'success', items: ['bot'], error: null });
  assert.notEqual(after, state);
});
test('older success cannot overwrite the current search', () => {
  const state = loading(2);
  assert.equal(reduce(state, { type: 'success', requestId: 1, items: ['stale'] }), state);
});
test('a future success cannot complete an unstarted request', () => {
  const state = loading(2);
  assert.equal(reduce(state, { type: 'success', requestId: 3, items: ['future'] }), state);
});
test('older failure cannot replace a current spinner', () => {
  const state = loading(2);
  assert.equal(reduce(state, { type: 'failure', requestId: 1, error: 'stale error' }), state);
});
test('future failure is ignored', () => {
  const state = loading(2);
  assert.equal(reduce(state, { type: 'failure', requestId: 3, error: 'future error' }), state);
});
test('current failure retains results and exact error text', () => {
  const before: State = { requestId: 2, query: 'next', status: 'loading', items: ['previous'], error: null };
  const after = reduce(before, { type: 'failure', requestId: 2, error: ' offline\n' });
  assert.deepEqual(after, { ...before, status: 'error', error: ' offline\n' });
  assert.notEqual(after, before);
});
test('late failure cannot undo successful completion', () => {
  const state = reduce(loading(), { type: 'success', requestId: 1, items: ['done'] });
  assert.equal(reduce(state, { type: 'failure', requestId: 1, error: 'late' }), state);
});
test('late success cannot undo failed completion', () => {
  const state = reduce(loading(), { type: 'failure', requestId: 1, error: 'failed' });
  assert.equal(reduce(state, { type: 'success', requestId: 1, items: ['late'] }), state);
});
test('duplicate success and failure are identity no-ops', () => {
  const success = reduce(loading(), { type: 'success', requestId: 1, items: ['done'] });
  const failure = reduce(loading(), { type: 'failure', requestId: 1, error: 'failed' });
  assert.equal(reduce(success, { type: 'success', requestId: 1, items: ['duplicate'] }), success);
  assert.equal(reduce(failure, { type: 'failure', requestId: 1, error: 'duplicate' }), failure);
});
test('responses alone cannot leave idle', () => {
  assert.equal(reduce(initialState, { type: 'success', requestId: 1, items: ['orphan'] }), initialState);
  assert.equal(reduce(initialState, { type: 'failure', requestId: 1, error: 'orphan' }), initialState);
});
test('success owns a snapshot of its payload', () => {
  const payload = ['first'];
  const state = reduce(loading(), { type: 'success', requestId: 1, items: payload });
  payload[0] = 'mutated';
  payload.push('later');
  assert.deepEqual(state.items, ['first']);
});
test('frozen state and event remain unchanged', () => {
  const state: State = Object.freeze({ requestId: 2, query: 'frozen', status: 'loading', items: Object.freeze(['old']), error: null });
  const event: Event = Object.freeze({ type: 'success', requestId: 2, items: Object.freeze(['new']) });
  const after = reduce(state, event);
  assert.deepEqual(state.items, ['old']);
  assert.equal(state.status, 'loading');
  assert.deepEqual(after.items, ['new']);
  assert.deepEqual(event.items, ['new']);
});
test('invalid request IDs reject even stale or terminal events', () => {
  const done = reduce(loading(), { type: 'success', requestId: 1, items: [] });
  for (const requestId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => reduce(done, { type: 'start', requestId, query: '' }), RangeError);
    assert.throws(() => reduce(done, { type: 'success', requestId, items: [] }), RangeError);
    assert.throws(() => reduce(done, { type: 'failure', requestId, error: '' }), RangeError);
  }
});
test('the largest safe request ID remains usable', () => {
  const state = loading(Number.MAX_SAFE_INTEGER);
  const after = reduce(state, { type: 'success', requestId: Number.MAX_SAFE_INTEGER, items: [] });
  assert.equal(after.status, 'success');
});
test('three out-of-order searches keep only the newest result', () => {
  let state = loading(10);
  state = reduce(state, { type: 'start', requestId: 11, query: 'eleven' });
  state = reduce(state, { type: 'start', requestId: 12, query: 'twelve' });
  state = reduce(state, { type: 'success', requestId: 11, items: ['eleven'] });
  state = reduce(state, { type: 'failure', requestId: 10, error: 'ten' });
  state = reduce(state, { type: 'success', requestId: 12, items: ['twelve'] });
  state = reduce(state, { type: 'success', requestId: 10, items: ['ten'] });
  assert.deepEqual(state, { requestId: 12, query: 'twelve', status: 'success', items: ['twelve'], error: null });
});
if (failures !== 0) throw new Error(`${failures} of ${tests} cases failed`);
console.log(`ARENA_TESTS_PASSED=${tests}`);
