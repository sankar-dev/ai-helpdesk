# AI Helpdesk

A learning project: a ticketing system where student emails become tickets, Claude classifies and summarizes them, auto-replies from a knowledge base when it can, and escalates the rest to human agents.

- What it does and why: [project-scope.md](project-scope.md)
- Stack and architecture decisions: [tech-stack.md](tech-stack.md)
- Phase-by-phase task list (tick boxes as work completes): [implementation-plan.md](implementation-plan.md)

## Documentation lookup

Always use the **context7** MCP server (`resolve-library-id` then `query-docs`) to fetch current documentation before writing or changing code that uses a library, framework, SDK, or CLI, even familiar ones. This project uses recent major versions (React 19, React Router 8, Vite 8, Tailwind 4, Express 5, Prisma 7, TypeScript 6, Vitest 5), and their APIs may differ from training data. Prefer context7 over web search for library docs.

For the Claude API / Anthropic SDK, use the `claude-api` skill.

## Layout

- `client/`: React + Vite + TypeScript, Tailwind + shadcn/ui, React Router. Pages in `src/pages/`, UI primitives in `src/components/ui/`.
- `server/`: Express 5 + TypeScript (ESM), Prisma 7 with the `pg` adapter. App setup in `src/app.ts`, entry in `src/index.ts`, routes in `src/routes/`. The Prisma client is generated into `src/generated/prisma/`; don't edit it by hand.
- `docker-compose.yml`: Postgres and Mailpit for local dev. Locally, the server currently uses a native PostgreSQL 18 install instead.
- Env: copy `.env.example` to `server/.env`. Never commit `.env`.

## Commands

Client (`cd client`): `npm run dev` (port 5173, proxies `/api` to the server), `npm run build`, `npm run lint`.

Server (`cd server`): `npm run dev` (port 3000), `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:migrate`, `npm run db:generate`, `npm run db:studio`.

## Conventions

- TypeScript everywhere; share types between client and server where useful.
- Lint with oxlint, format with Prettier (root `.prettierrc.json`).
- Validate API input and LLM JSON output with Zod; if LLM output fails validation or the call errors, escalate the ticket.
- Enforce roles on the server (`requireAuth`, `requireAdmin`), not only in the UI.
- Treat student email content as untrusted data in prompts (prompt-injection protection).
