# Keep stale responses out of the UI

A frontend search box starts requests while the user types. Responses arrive out of order, and some transports can report a late terminal event after cancellation or completion.

Repair the pure `reduce(state, event)` helper in `src/task.ts`. Preserve its exported types, `initialState`, and function signature. This is a dependency-free TypeScript state task, not an Angular runtime test.

## Contract

- Request IDs are positive safe integers, allocated in strictly increasing order by the caller. Any invalid event ID must throw `RangeError`, even when the event would otherwise be stale.
- A `start` event is accepted only when its ID is greater than the state's ID. It replaces `requestId` and `query`, sets `status` to `loading`, clears `error`, and retains the previous result items until a response arrives.
- A `success` or `failure` event is accepted only when its ID equals the state's ID **and** the state is still `loading`. Ignore older, future, duplicate, or already-completed response events.
- An accepted success replaces items, sets status to `success`, and clears error. Copy the supplied item array so subsequent caller mutation cannot alter state.
- An accepted failure sets status to `error`, stores the supplied message verbatim, and retains the previous items and query.
- Every ignored valid event returns the exact original state object. Every accepted event returns a new state object.
- Never mutate input state, its arrays, the event, or the event's arrays. Inputs may be frozen.
- The initial state is request ID `0`, empty query/items, status `idle`, and null error. Response events cannot start a request on their own.

Only the implementation file is editable. All evaluation cases are public.
