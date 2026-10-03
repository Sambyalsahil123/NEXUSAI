# NexusAI API

Phase 1 is a separate Node.js API. It serves `GET /api/v1/health` and checks MongoDB. Authentication, the website chat widget, and AI features are later phases.

## Run locally

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d
pnpm install
pnpm dev
```

The API listens on `http://localhost:4000`.

```bash
curl http://localhost:4000/api/v1/health
```

## Tests

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Tests use an in-memory MongoDB. Docker is only required when you run the API itself.
# NEXUSAI
