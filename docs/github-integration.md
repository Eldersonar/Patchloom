# GitHub Integration (Token Mode)

## Purpose
Token mode enables:
- read access for manual workflow triggers and webhook-driven runs
- write access for approval-gated PR comment publishing

## Required Environment
- `GITHUB_TOKEN`: token with repository read access (`repo` scope for private repos).
- `GITHUB_API_URL`: optional override for GitHub Enterprise API base URL.
- `GITHUB_WEBHOOK_SECRET`: shared secret for validating webhook signatures.
- `NGROK_ENABLED`: set `true` to use local ngrok helper.
- `NGROK_AUTHTOKEN`: required when `NGROK_ENABLED=true`.

Default API URL:
- `https://api.github.com`

## Manual Trigger Flow
1. Client calls `startPullRequestReview` with `repository` + `pullRequestNumber`, or `startPullRequestReviewFromUrl` with a PR URL.
2. API resolves owner/repo/PR number from the request.
3. API reads pull request metadata and changed files from GitHub with the configured token.
4. API starts the workflow run using fetched GitHub details.

## Comment Publishing Flow
1. Client fetches run suggestions and approval state.
2. Client approves all suggestions via `approveSuggestion`.
3. Client calls `publishComment` with run ID, PR URL target, and idempotency key.
4. API rejects publish when any suggestion is still unapproved.
5. API posts the comment to GitHub and stores `commentId` + `publishedUrl`.
6. Reusing the same `idempotencyKey` returns the existing publication record.

## Webhook Flow
1. Configure GitHub webhook to `POST /webhooks/github`.
2. API validates `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`.
3. Duplicate deliveries (`X-GitHub-Delivery`) are ignored idempotently.
4. Payloads are normalized into an internal PR/issue event shape.
5. Supported `pull_request` actions (`opened`, `reopened`, `synchronize`) start workflow runs.
6. `issues` events are currently normalized and ignored in MVP.

Example payloads for offline testing:
- `docs/examples/webhooks/pull_request.opened.json`
- `docs/examples/webhooks/issues.opened.json`

Local ngrok helper:
- `cp ngrok.example.yml ngrok.yml`
- `pnpm ngrok:start`

## Notes
- If `GITHUB_TOKEN` is missing, `startPullRequestReview` and `startPullRequestReviewFromUrl` return explicit configuration errors.
- If `GITHUB_TOKEN` is missing, `publishComment` returns an explicit configuration error.
- If `DEMO_MODE=true`, local startup seeds runs without requiring GitHub credentials.
- Write actions are guarded by full-suggestion approval and idempotency checks.
