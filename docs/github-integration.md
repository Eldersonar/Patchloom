# GitHub Integration (Token Mode)

## Purpose
Token mode enables read-only pull request access for manual workflow triggers.

## Required Environment
- `GITHUB_TOKEN`: token with repository read access (`repo` scope for private repos).
- `GITHUB_API_URL`: optional override for GitHub Enterprise API base URL.
- `GITHUB_WEBHOOK_SECRET`: shared secret for validating webhook signatures.

Default API URL:
- `https://api.github.com`

## Manual Trigger Flow
1. Client calls `startPullRequestReviewFromUrl` with a PR URL.
2. API parses owner/repo/PR number from the URL.
3. API reads pull request metadata from GitHub with the configured token.
4. API starts a normal `startPullRequestReview` workflow run using fetched details.

## Webhook Flow
1. Configure GitHub webhook to `POST /webhooks/github`.
2. API validates `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`.
3. Duplicate deliveries (`X-GitHub-Delivery`) are ignored idempotently.
4. Payloads are normalized into an internal PR/issue event shape.
5. Supported `pull_request` actions (`opened`, `reopened`, `synchronize`) start workflow runs.
6. `issues` events are currently normalized and ignored in MVP.

## Notes
- If `GITHUB_TOKEN` is missing, `startPullRequestReviewFromUrl` returns an explicit configuration error.
- This mode is read-only; write actions remain approval-gated and are not enabled in this phase.
