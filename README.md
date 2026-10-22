# REELIO

AI video editor for short-form vertical video. The editor changes a versioned JSON timeline. Remotion renders that same document for preview and export.

## Current build

- Phase 0: monorepo, timeline schema and patch engine, Remotion composition, API health server, Docker services, CI.
- Phase 1: email and password auth, Google OAuth when configured, project dashboard, Mongo models.

Sign up at http://localhost:3000/signup. Outside production, the API response includes the verification link when SMTP is unset, and the signup page follows it. MongoDB must be running.

## Requirements

- Node.js 22
- pnpm 10
- FFmpeg on PATH (media workers in later phases)
- Docker, for MongoDB, Redis, and MinIO. This machine can also run MongoDB and Redis directly.

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

- Web: http://localhost:3000
- API health: http://localhost:4000/health

## Checks

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## Layout

- `apps/web` — Next.js editor and site
- `apps/api` — Express API
- `packages/timeline-schema` — Zod timeline, migrations, patch ops
- `packages/remotion-comps` — composition shared by the player and the renderer

The schema is version 1. `migrateProject` rejects newer documents and upgrades older ones.
