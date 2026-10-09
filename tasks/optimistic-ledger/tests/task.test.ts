import assert from 'node:assert/strict';
import { apply, value, type State } from '../src/task';

let tests = 0;
let failures = 0;
function test(name: string, body: () => void): void {
  tests++;
  try { body(); }
  catch (error) { failures++; console.error(`FAIL ${name}:`, error); }
}
function empty(base = 10): State { return { base, pending: [], settled: [] }; }
function two(): State {
  return apply(apply(empty(), { type: 'adjust', token: 'A', delta: 5 }), { type: 'adjust', token: 'B', delta: 2 });
}
test('displayed value includes all pending deltas', () => {
  assert.equal(value({ base: 10, pending: [{ token: 'A', delta: 5 }, { token: 'B', delta: -2 }], settled: [] }), 13);
});
test('new adjustment changes only pending state', () => {
  const before = empty();
  const after = apply(before, { type: 'adjust', token: 'A', delta: 5 });
  assert.deepEqual(after, { base: 10, pending: [{ token: 'A', delta: 5 }], settled: [] });
  assert.notEqual(after, before);
});
test('duplicate pending token is an identity no-op', () => {
  const state = two();
  assert.equal(apply(state, { type: 'adjust', token: 'A', delta: 999 }), state);
});
test('commit one operation while preserving another', () => {
  const after = apply(two(), { type: 'commit', token: 'A' });
  assert.deepEqual(after, { base: 15, pending: [{ token: 'B', delta: 2 }], settled: ['A'] });
  assert.equal(value(after), 17);
});
test('rollback one operation while preserving another', () => {
  const after = apply(two(), { type: 'rollback', token: 'A' });
  assert.deepEqual(after, { base: 10, pending: [{ token: 'B', delta: 2 }], settled: ['A'] });
  assert.equal(value(after), 12);
});
test('out-of-order commit then rollback retains the committed value', () => {
  const after = apply(apply(two(), { type: 'commit', token: 'B' }), { type: 'rollback', token: 'A' });
  assert.deepEqual(after, { base: 12, pending: [], settled: ['B', 'A'] });
});
test('out-of-order rollback then commit gives the same balance', () => {
  const after = apply(apply(two(), { type: 'rollback', token: 'A' }), { type: 'commit', token: 'B' });
  assert.deepEqual(after, { base: 12, pending: [], settled: ['A', 'B'] });
});
test('duplicate and conflicting acknowledgements are identity no-ops', () => {
  const committed = apply(apply(empty(), { type: 'adjust', token: 'A', delta: 5 }), { type: 'commit', token: 'A' });
  const rolledBack = apply(apply(empty(), { type: 'adjust', token: 'B', delta: 2 }), { type: 'rollback', token: 'B' });
  for (const type of ['commit', 'rollback'] as const) {
    assert.equal(apply(committed, { type, token: 'A' }), committed);
    assert.equal(apply(rolledBack, { type, token: 'B' }), rolledBack);
  }
});
test('unknown acknowledgements are identity no-ops', () => {
  const state = two();
  assert.equal(apply(state, { type: 'commit', token: 'missing' }), state);
  assert.equal(apply(state, { type: 'rollback', token: 'missing' }), state);
});
test('settled tokens cannot be optimistically applied again', () => {
  for (const type of ['commit', 'rollback'] as const) {
    const state = apply(apply(empty(), { type: 'adjust', token: 'A', delta: 5 }), { type, token: 'A' });
    assert.equal(apply(state, { type: 'adjust', token: 'A', delta: 5 }), state);
  }
});
test('negative and zero deltas remain valid entries', () => {
  let state = apply(empty(-5), { type: 'adjust', token: 'minus', delta: -3 });
  state = apply(state, { type: 'adjust', token: 'zero', delta: 0 });
  assert.equal(value(state), -8);
  state = apply(state, { type: 'commit', token: 'zero' });
  assert.equal(state.base, -5);
  assert.equal(state.pending.length, 1);
  state = apply(state, { type: 'commit', token: 'minus' });
  assert.deepEqual(state, { base: -8, pending: [], settled: ['zero', 'minus'] });
});
test('removing a middle entry preserves both surrounding entries', () => {
  const state: State = { base: 0, pending: [{ token: 'A', delta: 1 }, { token: 'B', delta: 2 }, { token: 'C', delta: 3 }], settled: ['old'] };
  const after = apply(state, { type: 'rollback', token: 'B' });
  assert.deepEqual(after, { base: 0, pending: [{ token: 'A', delta: 1 }, { token: 'C', delta: 3 }], settled: ['old', 'B'] });
});
test('frozen nested inputs remain unchanged', () => {
  const state: State = Object.freeze({ base: 10, pending: Object.freeze([Object.freeze({ token: 'A', delta: 5 }), Object.freeze({ token: 'B', delta: 2 })]), settled: Object.freeze(['old']) });
  const after = apply(state, Object.freeze({ type: 'commit', token: 'B' }));
  assert.deepEqual(state, { base: 10, pending: [{ token: 'A', delta: 5 }, { token: 'B', delta: 2 }], settled: ['old'] });
  assert.deepEqual(after, { base: 12, pending: [{ token: 'A', delta: 5 }], settled: ['old', 'B'] });
  assert.notEqual(after, state);
});
test('accepted adjustment snapshots caller-owned event fields', () => {
  const event: { type: 'adjust'; token: string; delta: number } = { type: 'adjust', token: 'A', delta: 5 };
  const state = apply(empty(), event);
  event.token = 'changed';
  event.delta = 900;
  assert.deepEqual(state.pending, [{ token: 'A', delta: 5 }]);
  assert.equal(value(state), 15);
});
test('different state instances do not share settled-token memory', () => {
  const one = apply(apply(empty(), { type: 'adjust', token: 'A', delta: 5 }), { type: 'commit', token: 'A' });
  const another = apply(empty(), { type: 'adjust', token: 'A', delta: 5 });
  assert.equal(value(one), 15);
  assert.equal(another.pending.length, 1);
});
test('all settlement permutations conserve accepted adjustments', () => {
  for (const order of [['A', 'B', 'C'], ['A', 'C', 'B'], ['B', 'A', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B'], ['C', 'B', 'A']]) {
    let state: State = { base: 10, pending: [{ token: 'A', delta: 5 }, { token: 'B', delta: -3 }, { token: 'C', delta: 2 }], settled: [] };
    for (const token of order) state = apply(state, { type: token === 'B' ? 'rollback' : 'commit', token });
    assert.equal(value(state), 17);
    assert.equal(state.base, 17);
    assert.deepEqual(state.pending, []);
    assert.deepEqual(state.settled, order);
  }
});
if (failures !== 0) throw new Error(`${failures} of ${tests} cases failed`);
console.log(`ARENA_TESTS_PASSED=${tests}`);
