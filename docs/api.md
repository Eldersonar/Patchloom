# API Guide

Base endpoint:
- HTTP: `http://localhost:4000/graphql`
- WebSocket: `ws://localhost:4000/graphql`

## Queries

### `health`
```graphql
query Health {
  health {
    status
    version
  }
}
```

### `listRuns`
```graphql
query ListRuns {
  listRuns {
    id
    repository
    pullRequestNumber
    status
    summary
    failureReason
    confidence
    suggestions {
      id
      kind
      content
    }
  }
}
```

### `getRun(id)`
```graphql
query GetRun($id: ID!) {
  getRun(id: $id) {
    id
    status
    summary
    risks
    suggestedTests
    followUpTasks
  }
}
```

## Mutations

### `startPullRequestReview`
```graphql
mutation StartRun($input: StartPullRequestReviewInput!) {
  startPullRequestReview(input: $input) {
    id
    status
  }
}
```

Example variables:
```json
{
  "input": {
    "repository": "acme/payments",
    "pullRequestNumber": 281,
    "pullRequestTitle": "Improve auth refresh flow"
  }
}
```

### `startPullRequestReviewFromUrl`
```graphql
mutation StartFromUrl($input: StartPullRequestReviewFromUrlInput!) {
  startPullRequestReviewFromUrl(input: $input) {
    id
    repository
    pullRequestNumber
  }
}
```

### `approveSuggestion`
```graphql
mutation Approve($input: ApproveSuggestionInput!) {
  approveSuggestion(input: $input) {
    id
    decision
    suggestionId
  }
}
```

### `publishComment`
```graphql
mutation Publish($input: PublishCommentInput!) {
  publishComment(input: $input) {
    id
    idempotencyKey
    commentId
    publishedUrl
  }
}
```

## Subscriptions

### `runUpdated(runId)`
```graphql
subscription RunUpdated($runId: ID!) {
  runUpdated(runId: $runId) {
    id
    status
    summary
    failureReason
  }
}
```

## Approval + Publish Flow
1. Start run.
2. Wait for `waiting_for_approval`.
3. Approve each suggestion.
4. Publish with idempotency key.

Publish fails when approvals are missing or GitHub token integration is not configured.
