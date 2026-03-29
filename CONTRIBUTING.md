# Contributing

Thanks for contributing to Patchloom.

## Development Setup
1. `pnpm install`
2. `cp .env.example .env`
3. `docker compose up -d`
4. `pnpm lint && pnpm typecheck && pnpm test`

Use `DEMO_MODE=true` in `.env` for local development without GitHub credentials.

## Branching and Commits
- Create a feature branch from `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
  - `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`
- Keep commits focused and reviewable.

## Pull Requests
- Follow `.github/PULL_REQUEST_TEMPLATE.md`.
- Include:
  - clear summary
  - test results
  - docs updates when behavior changes

## Testing Expectations
- Add or update tests for any behavior change.
- Run locally before opening a PR:
```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
```

## Coding Standards
- TypeScript for backend and frontend.
- JSDoc comments for functions.
- Keep files under 300 lines where possible; split when needed.
- Prefer structured outputs and explicit error handling.

## Reporting Issues
- Use the provided GitHub issue templates for bug reports and feature requests.
