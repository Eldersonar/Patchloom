# AGENTS.md

## Purpose
This file defines implementation standards for the AI Engineering Workflow Assistant.

## Core Standards
- Keep implementation simple and maintainable.
- Use TypeScript for all backend and frontend code.
- Use Node.js for backend services.
- Use React for frontend applications.
- Use Docker-based local development and deployment workflows.

## Code Quality Rules
- Every function must include JSDoc comments.
- All features must include unit tests.
- All end-to-end flows and integration boundaries must include integration tests.
- Treat tests as required, not optional.

## Architecture Rules
- The system must support external agent integration (for example, OpenClaw).
- Public APIs and payloads should be stable and structured for agent consumption.
- Prefer clear service boundaries and avoid tight coupling between modules.

## Documentation Rules
- Maintain a comprehensive `README.md`.
- Update `README.md` whenever features are added, changed, or removed.
- Keep setup instructions accurate and runnable.

## File Size Rule
- No source or documentation file should exceed 300 lines.
- If any file approaches or exceeds 300 lines, refactor and split it into multiple files.

## Development Workflow
- Build read-only and low-risk workflows first.
- Add write actions only with explicit approval and auditability.
- Keep changes small, reviewable, and test-backed.
