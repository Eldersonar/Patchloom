# AI Engineering Workflow Assistant

Open-source, self-hostable assistant for engineering workflows. It provides a GraphQL control plane plus LangGraph-ready workflow orchestration for PR/issue triage, risk/test suggestions, and approval-gated publishing.

## Current Status
- Phase 0 foundation is implemented.
- Phase 1 core API skeleton is implemented.
- Current API includes run lifecycle transitions, `runUpdated` subscription events, and structured PR workflow outputs.

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
- Provider-agnostic AI interface with Gemini adapter and factory wiring.
- DB connection check utility with tests.
- Initial SQL migration and domain model documentation.
- Docker Compose setup for Postgres and Redis.
- CI pipeline for lint, typecheck, and tests.

## Requirements
- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

## Quick Start
1. Install dependencies:
```bash
pnpm install
```
2. Copy environment template:
```bash
cp .env.example .env
```
3. Start local dependencies:
```bash
docker compose up -d
```
4. Validate quality gates:
```bash
pnpm lint
pnpm typecheck
pnpm test
```
5. Run services:
```bash
pnpm --filter @patchloom/api dev
pnpm --filter @patchloom/web dev
```

## Environment Variables
See `.env.example`.

Required for current scaffold:
- `APP_VERSION`
- `NODE_ENV`
- `PORT`
- `MODEL_PROVIDER`
- `GEMINI_MODEL`
- `GEMINI_API_KEY`
- `GITHUB_API_URL`
- `GITHUB_TOKEN` (required for `startPullRequestReviewFromUrl` and private repos)
- `GITHUB_WEBHOOK_SECRET` (required for `/webhooks/github` signature verification)
- `DATABASE_URL`
- `REDIS_URL`

## Testing and Quality
- Unit tests are required for all functionality.
- Integration tests are required for end-to-end flows and external boundaries.
- Current checks:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

## Agent Compatibility
The architecture is being built for external agent integration (for example, OpenClaw):
- structured GraphQL operations
- deterministic run states
- human approval gates before write actions

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

## Subscriptions
- HTTP endpoint: `http://localhost:4000/graphql`
- WebSocket endpoint: `ws://localhost:4000/graphql`
- Reconnect strategy and usage notes: [`docs/subscriptions.md`](/home/simon/Documents/personal/Patchloom/docs/subscriptions.md)

## GitHub Token Mode
- Manual PR URL trigger docs: [`docs/github-integration.md`](/home/simon/Documents/personal/Patchloom/docs/github-integration.md)

## Roadmap (Near-Term)
1. Run model + persistence schema (`WorkflowRun`, `Suggestion`, approvals)
2. GraphQL mutations/queries/subscriptions for run lifecycle
3. Provider-agnostic model interface (Gemini first)
4. First LangGraph PR summary + risk + test suggestion workflow
5. GitHub read-only ingestion and webhook verification

## License
MIT. See [`LICENSE`](/home/simon/Documents/personal/Patchloom/LICENSE).
