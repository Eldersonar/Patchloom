# Setup Guide

This setup path is designed to run in under 15 minutes on a clean machine.

## Prerequisites
- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

## Quick Setup
1. Clone and install dependencies:
```bash
git clone https://github.com/Eldersonar/Patchloom.git
cd Patchloom
pnpm install
```
2. Create local environment:
```bash
cp .env.example .env
```
3. Configure environment:
- Real mode (recommended): keep `DEMO_MODE=false` and set `GEMINI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`.
- Demo mode (optional): set `DEMO_MODE=true`.
```bash
sed -i 's/^DEMO_MODE=.*/DEMO_MODE=true/' .env
```
4. Start dependencies:
```bash
docker compose up -d
```
5. Run quality checks:
```bash
pnpm lint
pnpm typecheck
pnpm test
```
6. Start services:
```bash
pnpm dev
```

## Verification Checklist
- API responds:
```bash
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query { health { status version } }"}'
```
- Web UI loads at `http://localhost:5173`.
- With `DEMO_MODE=true`, run list is pre-populated.

## Optional GitHub Integration
- Set `GITHUB_TOKEN` for real PR lookup, webhook enrichment, and approved comment publishing.
- Set `GITHUB_WEBHOOK_SECRET` if using `/webhooks/github`.
- Keep `DEMO_MODE=true` for local exploration; set `DEMO_MODE=false` for pure external-trigger behavior.

## Optional ngrok Tunnel
Use this when testing GitHub webhooks against local API:

1. `cp ngrok.example.yml ngrok.yml`
2. Set in `.env`:
   - `NGROK_ENABLED=true`
   - `NGROK_AUTHTOKEN=<your-token>`
3. Start API:
```bash
pnpm --filter @patchloom/api dev
```
4. Start tunnel:
```bash
pnpm ngrok:start
```
5. Configure GitHub webhook payload URL:
   - `https://<your-ngrok-domain>/webhooks/github`
