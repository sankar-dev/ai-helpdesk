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
- `e2e/`: Playwright end-to-end tests, a separate npm package (see Testing below).
- `.claude/agents/code-reviewer.md`: read-only subagent that reviews changes for correctness bugs and security vulnerabilities. Use it before committing non-trivial changes.
- `.claude/agents/e2e-test-writer.md`: subagent that writes, runs, and fixes Playwright tests in `e2e/`. Use it for all E2E test work (see Testing).
- `docker-compose.yml`: Postgres and Mailpit for local dev. Locally, the server currently uses a native PostgreSQL 18 install instead.
- Env: copy `.env.example` to `server/.env`. Never commit `.env`.

## Authentication

Better Auth with email and password, Prisma adapter. Use the Better Auth skills (`better-auth-best-practices` etc.) when changing it.

- Server config: `server/src/auth/auth.ts`. Public sign-up is disabled (`disableSignUp`); users are meant to be created by admins (no user-management routes exist yet). The first admin comes from `npm run db:seed`, which goes through Better Auth's internal adapter (`internalAdapter.createUser` + `linkAccount`) because the sign-up endpoint is off. The seed is idempotent and promotes an existing user to admin. It lower-cases the email (Better Auth stores emails lower-cased) and enforces Better Auth's `minPasswordLength`, which the internal adapter otherwise skips.
- Roles: `user.role` is a Prisma enum `Role { admin, agent }` (default `agent`), registered as a Better Auth `additionalFields` entry with `input: false` so clients can't set it. `schema.prisma` was hand-edited after `npx auth generate` to make `role` an enum; keep that if you regenerate.
- Sessions are stored only in the database (no cookie cache or secondary storage), so every request hits the `session` table and sign-out takes effect immediately. 7-day expiry, refreshed at most daily. Secure cookies only in production.
- Rate limiting is set explicitly to `config.nodeEnv === 'production'` (Better Auth defaults: 100 requests / 10s, sign-in and other sensitive endpoints 3 / 10s), so it is off in development and e2e runs. Before deploying: configure `advanced.ipAddress` for the real proxy (otherwise clients can spoof `X-Forwarded-For`), and consider database storage for the limiter (it is in-memory now).
- Express: Better Auth is mounted at `/api/auth/{*any}` in `src/app.ts` **before** `express.json()` (it parses its own bodies). Protect routes with `requireAuth` (401, sets `req.user` / `req.session`) then `requireAdmin` (403) from `src/auth/middleware.ts`; `req` types are in `src/types/express.d.ts`. `GET /api/me` returns the current user.
- Client: `client/src/lib/auth-client.ts` exports `useSession`, `signIn`, `signOut`. It has no `baseURL` and calls same-origin `/api/auth/*` (the Vite proxy forwards it in dev), and uses `inferAdditionalFields` to type `role`. `AppLayout` redirects to `/login` when there's no session; `LoginPage` redirects to `/dashboard` when there is one and shows a generic "Invalid email or password" on 401. Admin-only pages (currently `/users`) are nested under the `RequireAdmin` layout route in `App.tsx`, which redirects non-admins to `/dashboard`; their sidebar links are marked `adminOnly` in `AppLayout`'s `navItems`. These are UX only; the server enforces access, so any `/api/users` routes must use `requireAuth` + `requireAdmin`.
- Env (`server/.env`): `BETTER_AUTH_SECRET` (`src/config.ts` refuses to start if it is under 32 characters or the `.env.example` placeholder), `BETTER_AUTH_URL` (the server, `http://localhost:3000`), `CLIENT_URL` (used for `trustedOrigins`, defaults to `http://localhost:5173`), and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME`.

## Commands

Client (`cd client`): `npm run dev` (port 5173, proxies `/api` to the server), `npm run build`, `npm run lint`.

Server (`cd server`): `npm run dev` (port 3000), `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:migrate`, `npm run db:generate`, `npm run db:seed` (creates the admin from `SEED_ADMIN_*` env vars), `npm run db:studio`.

Cold starts on this machine are slow: Vite takes about 40s and the server can take about 3 minutes before it listens on port 3000. Wait for `Server running on http://localhost:3000` before assuming it failed. Smoke test: `GET /api/health` returns `{"status":"ok","database":"connected"}`, both directly and through the Vite proxy.

E2E (`cd e2e`): `npm test`, `npm run test:ui`, `npm run report`, `npm run typecheck`, `npm run db:prepare` (reset the test DB only). Chromium is installed with `npx playwright install chromium`.

## Testing

- Server unit/integration tests: Vitest + supertest in `server/src/**/*.test.ts`, run against `createApp()` from `src/app.ts`.
- E2E: Playwright in `e2e/`, with its own servers (ports 3001/5174) and a separate `helpdesk_test` database that is wiped each run. How the setup works and the test-writing conventions live in `.claude/agents/e2e-test-writer.md`.
- **Always delegate E2E test work to the `e2e-test-writer` subagent**: writing new Playwright tests, extending or fixing existing ones, and debugging failing E2E runs. Don't write `e2e/` tests directly in the main session. Give it the feature or flow to cover, plus anything it can't see in the code (e.g. expected behaviour not built yet). Relay its report: files changed, pass/fail result, and any app bugs it found.

## Conventions

- TypeScript everywhere; share types between client and server where useful.
- Lint with oxlint, format with Prettier (root `.prettierrc.json`).
- Validate API input and LLM JSON output with Zod; if LLM output fails validation or the call errors, escalate the ticket.
- Styling is Tailwind utility classes only: no inline `style=`, no per-component CSS files. `client/src/index.css` is the single stylesheet; it is the Tailwind entry and holds the shadcn theme tokens, so don't delete it. Put shared input behaviour in the shadcn primitives (e.g. Chrome's autofill styling is neutralised with `autofill:` classes in `src/components/ui/input.tsx`).
- Enforce roles on the server (`requireAuth`, `requireAdmin`), not only in the UI.
- Errors: `src/app.ts` has a final error handler that logs and returns `{"error":"Internal server error"}` (no stack traces), and `X-Powered-By` is disabled. Unknown `/api/*` paths return a JSON 404.
- Treat student email content as untrusted data in prompts (prompt-injection protection).
