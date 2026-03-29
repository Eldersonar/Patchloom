# AI Engineering Workflow Assistant

Open-source, self-hostable assistant for engineering workflows. It provides a GraphQL control plane plus workflow orchestration for PR/issue triage, risk/test suggestions, and approval-gated publishing.

## Current Capabilities
- GraphQL run lifecycle APIs with real-time `runUpdated` subscriptions.
- Structured PR review outputs (summary, risks, suggested tests, follow-up tasks).
- Output refinement for concise summaries and de-duplicated suggestions.
- Human approval flow before publishing comments.
- GitHub token-mode manual trigger + webhook ingestion with real PR fetch.
- Demo mode (`DEMO_MODE=true`) for local onboarding without GitHub credentials.

## Why This Project Exists
Engineering teams spend too much time on repetitive coordination around code changes:
- summarizing PRs and issues
- identifying risk and test gaps
- converting analysis into follow-up tasks
- keeping humans and agents aligned on "what happens next"

This project aims to automate first-pass analysis while keeping human approval for risky actions.

## Stack
- Frontend: React + TypeScript (Vite shell for now)
- Backend: Node.js + TypeScript + Apollo GraphQL
- AI orchestration target: LangGraph / LangChain
- Data: PostgreSQL
- Queue/pubsub/cache: Redis
- Containers: Docker Compose

## Monorepo Structure
- `apps/api` GraphQL API service
- `apps/web` React web shell
- `packages/config` env parsing and validation
- `packages/ai` provider abstraction and adapters
- `packages/core` shared workflow types
- `packages/db` DB connection utilities
- `packages/db/migrations` SQL migration files
- `.github/workflows/ci.yml` lint/typecheck/test workflow

## Implemented Foundations
- Workspace and package scaffolding with `pnpm`.
- Typed env validation (`zod`) with tests.
- API GraphQL skeleton with `health` query and tests.
- API GraphQL run flow with `startPullRequestReview`, `getRun`, and `listRuns`.
- API GraphQL manual trigger with `startPullRequestReviewFromUrl`.
- API GraphQL subscription with `runUpdated(runId: ID!)`.
- PR review workflow nodes producing summary, risks, suggested tests, follow-up tasks, and confidence.
- Prompt/workflow version metadata and run artifacts (raw model responses + normalized output) stored in run state.
- Suggestion approval and publish-governance store with idempotent publication records.
- In-memory run store for development and test workflows.
- GitHub token-mode comment publishing for approved suggestions.
- Web dashboard for starting runs, viewing run list/details, subscribing to live run updates, approving suggestions, and publishing approved comments.
- Provider-agnostic AI interface with Gemini adapter and factory wiring.
- Demo mode run seeding for local onboarding without external integrations.
- DB connection check utility with tests.
- Initial SQL migration and domain model documentation.
- Docker Compose setup for Postgres and Redis.
- CI pipeline for lint, typecheck, unit tests, and integration tests.

## Requirements
- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

## Quick Start
Detailed onboarding guide: [`docs/setup.md`](/home/simon/Documents/personal/Patchloom/docs/setup.md)

1. Install dependencies:
```bash
pnpm install
```
2. Copy environment template:
```bash
cp .env.example .env
```
3. Configure `.env`:
   - Real mode (recommended): set `GEMINI_API_KEY`, `GITHUB_TOKEN`, and `GITHUB_WEBHOOK_SECRET`.
   - Demo mode (optional): set `DEMO_MODE=true`.
```bash
sed -i 's/^DEMO_MODE=.*/DEMO_MODE=true/' .env
```
4. Start local dependencies:
```bash
docker compose up --build
```
5. Validate quality gates:
```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
```
6. Run services:
```bash
pnpm dev
```

If you use Docker for all services, you can skip step 6.

Run only infra dependencies when needed:
```bash
docker compose up postgres redis
```

## Test Real Flow (No Mock Data)
1. Set `DEMO_MODE=false`, `GEMINI_API_KEY`, and `GITHUB_TOKEN` in `.env`.
2. Run `pnpm dev`.
3. Open `http://localhost:5173`.
4. In the form, enter `owner/repo` (or GitHub PR URL) plus PR number.
5. Start run and confirm the run fails for invalid PR numbers and succeeds for real PRs.

### Troubleshooting Run Failures
Inspect API logs:
```bash
docker compose logs -f api
```

Look for structured events:
- `workflow_started`
- `workflow_waiting_for_approval`
- `workflow_completed`
- `workflow_failed` (includes `failureReason` and error details)

## GitHub Webhook Setup
Patchloom expects GitHub webhooks at:
- `https://<your-domain>/webhooks/github`

For local testing, use a tunnel and set:
- `https://<your-tunnel-domain>/webhooks/github`

### Ngrok (Local)
1. Copy the provided template:
```bash
cp ngrok.example.yml ngrok.yml
```
2. Set ngrok flags in `.env`:
```bash
NGROK_ENABLED=true
NGROK_AUTHTOKEN=<your-token>
```
3. Start your local API:
```bash
pnpm --filter @patchloom/api dev
```
4. Start ngrok with env-aware helper:
```bash
pnpm ngrok:start
```
5. Use the generated HTTPS URL in GitHub as:
- `https://<your-ngrok-domain>/webhooks/github`

Example secret generation:
```bash
openssl rand -hex 32
```

Then set it in `.env`:
```bash
GITHUB_WEBHOOK_SECRET=<paste-generated-secret>
```

In GitHub repository settings:
1. Go to `Settings` -> `Webhooks` -> `Add webhook`.
2. Set **Payload URL** to your `/webhooks/github` endpoint.
3. Set **Content type** to `application/json`.
4. Paste the same secret value into **Secret**.
5. Select events:
   - `Pull requests`
   - `Issues`
6. Keep SSL verification enabled.

## Environment Variables
See `.env.example`.

Required for current scaffold:
- `APP_VERSION`
- `NODE_ENV`
- `PORT`
- `DEMO_MODE` (enable local seeded runs without GitHub credentials)
- `NGROK_ENABLED` (enable/disable ngrok helper script)
- `NGROK_AUTHTOKEN` (required when `NGROK_ENABLED=true`)
- `MODEL_PROVIDER`
- `GEMINI_MODEL`
- `GEMINI_API_KEY` (required when `DEMO_MODE=false` and `MODEL_PROVIDER=gemini`)
- `GITHUB_API_URL`
- `GITHUB_TOKEN` (required for real-data PR lookup and publish actions)
- `GITHUB_WEBHOOK_SECRET` (required for `/webhooks/github` signature verification)
- `DATABASE_URL`
- `REDIS_URL`

## Testing and Quality
- Unit tests are required for all functionality.
- Integration tests are required for end-to-end flows and external boundaries.
- Current checks:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test:unit`
  - `pnpm test:integration`

## Agent Compatibility
The architecture is being built for external agent integration (for example, OpenClaw):
- structured GraphQL operations
- deterministic run states
- human approval gates before write actions

## Web Dashboard (Current)
- Start PR review runs from the browser.
- View run list with status and repository context.
- View structured run details (summary, risks, suggested tests, follow-up tasks).
- Color-coded suggestion and detail cards by kind (risk/test/follow-up).
- Receive live status/detail updates through GraphQL `runUpdated` subscriptions.
- Approve/reject generated suggestions from run details.
- Publish approved summary comments to GitHub pull requests.

## GraphQL Operations (Current)
- Query `health`
- Query `getRun(id: ID!)`
- Query `listRuns`
- Mutation `startPullRequestReview(input: StartPullRequestReviewInput!)`
- Mutation `startPullRequestReviewFromUrl(input: StartPullRequestReviewFromUrlInput!)`
- Mutation `approveSuggestion(input: ApproveSuggestionInput!)`
- Mutation `publishComment(input: PublishCommentInput!)`
- Query `listApprovalDecisions(runId: ID!)`
- Query `listCommentPublications(runId: ID!)`
- Subscription `runUpdated(runId: ID!)`
- `WorkflowRun` now includes `confidence`, `risks`, `suggestedTests`, `followUpTasks`, `promptVersion`, and `workflowVersion`.

`startPullRequestReview` now performs a GitHub lookup from `repository` + `pullRequestNumber`. Non-existent PRs return a GitHub read error instead of producing deterministic mock output.

## Documentation
- Setup: [`docs/setup.md`](/home/simon/Documents/personal/Patchloom/docs/setup.md)
- Architecture: [`docs/architecture.md`](/home/simon/Documents/personal/Patchloom/docs/architecture.md)
- API guide: [`docs/api.md`](/home/simon/Documents/personal/Patchloom/docs/api.md)
- Domain model: [`docs/domain-model.md`](/home/simon/Documents/personal/Patchloom/docs/domain-model.md)
- GitHub integration: [`docs/github-integration.md`](/home/simon/Documents/personal/Patchloom/docs/github-integration.md)
- Subscription usage: [`docs/subscriptions.md`](/home/simon/Documents/personal/Patchloom/docs/subscriptions.md)
- Example webhook payloads: `docs/examples/webhooks/*.json`

## Contributing
- Contribution guide: [`CONTRIBUTING.md`](/home/simon/Documents/personal/Patchloom/CONTRIBUTING.md)
- Use GitHub issue templates for bugs and feature requests.

## Subscriptions
- HTTP endpoint: `http://localhost:4000/graphql`
- WebSocket endpoint: `ws://localhost:4000/graphql`
- Reconnect strategy and usage notes: [`docs/subscriptions.md`](/home/simon/Documents/personal/Patchloom/docs/subscriptions.md)

## GitHub Token Mode
- Manual PR URL trigger docs: [`docs/github-integration.md`](/home/simon/Documents/personal/Patchloom/docs/github-integration.md)
- Required for publish actions:
  - `GITHUB_TOKEN` must include pull request comment permissions.
  - `publishComment` enforces full suggestion approval before posting.

## Roadmap (Near-Term)
1. Run model + persistence schema (`WorkflowRun`, `Suggestion`, approvals)
2. GraphQL mutations/queries/subscriptions for run lifecycle
3. Provider-agnostic model interface (Gemini first)
4. First LangGraph PR summary + risk + test suggestion workflow
5. GitHub read-only ingestion and webhook verification

## License
MIT. See [`LICENSE`](/home/simon/Documents/personal/Patchloom/LICENSE).
