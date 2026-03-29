# AI Engineering Workflow Assistant

An open-source, self-hostable assistant that helps engineering teams and AI agents analyze PRs and issues, assess risk, suggest tests, and manage follow-up actions through a GraphQL control plane.

## Status

- Planning and implementation scaffolding in progress.
- MVP target: PR summary + risk review + suggested tests + approval-gated publishing.

## Goals

- Demonstrate practical AI engineering with LangChain/LangGraph.
- Provide a GraphQL-first API for human and agent consumers.
- Keep setup simple for contributors and self-hosting teams.
- Stay provider-agnostic while starting MVP with Gemini.

## Tech Stack

- Frontend: React (Next.js), TypeScript
- Backend: Node.js, TypeScript, GraphQL server
- AI orchestration: LangGraph/LangChain
- Data: PostgreSQL
- Queue/pubsub/cache: Redis
- Containerization: Docker / Docker Compose

## Key Product Capabilities (MVP)

- Pull request analysis workflow
  - summary
  - risk areas
  - suggested tests
  - follow-up tasks
  - confidence score
- Workflow run tracking with deterministic states
- Human approval before write actions
- GraphQL API for queries, mutations, and subscriptions
- External agent-compatible interfaces (for example, OpenClaw)

## Architecture Principles

- Read-only first, write actions later
- Structured outputs over long unstructured prose
- Clear service boundaries and modular components
- No silent failures; explicit state transitions
- Human approval required before risky or external write actions

## Repository Docs

- Proposal: `/ai-engineering-workflow-assistant-proposal.md`
- Execution plan: `/implementation-checklist.md`
- Engineering standards: `/AGENTS.md`

## Quality and Testing Requirements

- Unit tests are required for all functionality.
- Integration tests are required for all flows and integration boundaries.
- Provider adapters must pass shared contract tests.
- New behavior should include tests in the same change set.

## Documentation Requirements

- `README.md` must be kept comprehensive.
- Update `README.md` whenever features are added, changed, or removed.
- Keep all docs and source files at or under 300 lines.
- If a file gets too large, split it into multiple focused files.

## Local Development (Planned)

1. Install dependencies:

```bash
pnpm install
```

2. Start local infrastructure:

```bash
docker compose up
```

3. Run migrations:

```bash
pnpm db:migrate
```

4. Start development servers:

```bash
pnpm dev
```

Note: Command scripts will be finalized as the monorepo scaffolding is implemented.

## Roadmap (Short)

1. Monorepo scaffold + Docker dependencies
2. GraphQL API skeleton + run persistence
3. Provider-agnostic model interface + Gemini adapter
4. LangGraph PR workflow
5. GitHub read-only integration + webhook verification
6. Approval flow + comment publishing
7. Agent integration examples and API docs

## License

MIT. See [`LICENSE`](/home/simon/Documents/personal/Patchloom/LICENSE).
