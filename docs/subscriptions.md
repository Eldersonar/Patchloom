# Subscriptions

Patchloom exposes GraphQL subscriptions over WebSocket on the same path as HTTP GraphQL.

- HTTP endpoint: `http://localhost:4000/graphql`
- WebSocket endpoint: `ws://localhost:4000/graphql`

## Supported Subscription

```graphql
subscription OnRunUpdated($runId: ID!) {
  runUpdated(runId: $runId) {
    id
    status
    updatedAt
  }
}
```

## Reconnect Guidance

Use exponential backoff with jitter in the client:

1. Start with 1 second delay.
2. Double delay on each failed reconnect.
3. Cap delay at 30 seconds.
4. Add random jitter (0-250ms) to avoid reconnect spikes.

Recommended client behavior:

- Reconnect automatically when socket closes unexpectedly.
- Re-subscribe to active `runUpdated` streams after reconnect.
- On reconnect, call `getRun(runId)` once to catch up with the latest state.

## Notes

Current implementation uses an in-memory run store for development scaffolding.
A persistent pub/sub backend will be added in later phases.
