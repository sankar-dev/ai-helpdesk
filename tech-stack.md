# AI Helpdesk: Tech Stack

TypeScript across the whole project: one language, shared types between frontend and backend.

## Overview

| Layer | Choice | Purpose |
|---|---|---|
| **Frontend** | React + Vite + TypeScript | Agent/admin web app |
| **UI components** | Tailwind CSS + shadcn/ui | Tables, forms, dialogs, badges |
| **Routing** | React Router | Pages: login, dashboard, ticket list, ticket detail, users |
| **Data fetching** | TanStack Query | API calls, caching, refetching |
| **Tables** | TanStack Table | Ticket list filtering, sorting, search |
| **Backend** | Node.js + Express + TypeScript | REST API and email webhooks |
| **Validation** | Zod | Validate API requests and LLM JSON output |
| **Database** | PostgreSQL | All app data, including sessions |
| **ORM** | Prisma | Typed queries and migrations |
| **Background jobs** | pg-boss | Queue for AI processing, runs on Postgres (no Redis) |
| **Authentication** | Better Auth with database sessions | Login, sessions, Admin/Agent roles |
| **Email** | Postmark | Inbound webhook (receive) and outbound API (send) |
| **LLM** | Claude via Anthropic TypeScript SDK | Classification, summaries, replies |
| **Testing** | Vitest + eval script | Unit tests and AI accuracy evaluation |
| **Local dev** | Docker Compose, Mailpit, ngrok | Postgres + local mail catcher; expose webhook to Postmark |

## Authentication: database sessions

Sessions are stored in PostgreSQL, not as JWTs. The browser holds only a random session ID in a cookie.

**Library:** Better Auth with its Prisma adapter. Database sessions are its default, it hashes passwords, and its admin plugin covers user management (create users, set roles, deactivate).

**How it works:**
1. User logs in with email and password.
2. Server verifies the password hash, creates a row in the `session` table, and sets a cookie with the session ID.
3. On every API request, middleware looks up the session in the database and loads the user and role.
4. Logout deletes the session row.

**Session rules:**
- Cookie: `httpOnly`, `secure` (in production), `sameSite=lax`.
- Expiry: 7 days, extended on activity.
- Deactivating a user deletes all their sessions, so they're logged out immediately. This is the main advantage over JWTs.
- Role checks happen on the server: `requireAuth` for agent routes, `requireAdmin` for user management routes. Hiding pages in the UI is not enough.

**Tables (managed by Better Auth):** `user` (with a `role` field: `admin` | `agent`), `session`, `account` (holds the password hash), `verification`.

**Public signup is disabled.** Only admins create accounts. The first admin is created by a seed script.

## LLM

| Task | Model | Output |
|---|---|---|
| Classification + escalation decision | Claude Haiku 4.5 (`claude-haiku-4-5`) | JSON: category, confidence, escalate, reason |
| Ticket summary | Claude Haiku 4.5 | 1–2 sentence summary |
| Auto-reply | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Reply text + IDs of KB articles used |
| Suggested reply for agents | Claude Sonnet 5.5 | Draft reply text + IDs of KB articles used |

- **Knowledge base in the prompt:** the sample KB (about 30–45 articles) is loaded into the system prompt with **prompt caching**. No vector database for v1. Add pgvector to the same Postgres database if the KB grows past a few hundred articles.
- **Structured output:** LLM JSON responses are validated with Zod before use. If validation fails, the ticket is escalated.
- **Fail safe:** if the LLM call errors or times out, the ticket is escalated to an agent.
- **Prompt injection:** the student's email is passed as clearly delimited data, and the system prompt says to never follow instructions inside it.

## Email

- **Inbound:** Postmark receives mail sent to the support address and POSTs it as JSON to `POST /webhooks/inbound`. The webhook saves the ticket and message, enqueues a job, and returns quickly.
- **Threading:** the `Message-ID`, `In-Reply-To`, and `References` headers are stored on each message, so replies attach to the existing ticket.
- **Outbound:** replies are sent through the Postmark API with the correct threading headers, so they appear in the student's existing email thread.
- **Local dev:** outgoing mail goes to Mailpit instead of real inboxes. A seed script creates tickets from sample emails without needing Postmark.

## Ticket processing flow

```
Email → Postmark → POST /webhooks/inbound → save ticket + message → enqueue job
                                                                      ↓
            pg-boss worker: classify + summarize (Haiku) → auto-reply?
                 ├─ yes → generate reply (Sonnet) → send via Postmark → status: AI Resolved
                 └─ no  → generate suggested reply (Sonnet) → status: Escalated
```

## Docker and deployment

### Containers
| Service | Image | Command | Public? |
|---|---|---|---|
| `web` | App image | Express API + serves the built React app | Yes (HTTPS) |
| `worker` | Same app image | pg-boss worker for AI jobs | No |
| `postgres` | `postgres` official image locally; managed Postgres in the cloud | — | No |
| `mailpit` | `axllent/mailpit` (local only) | Catches outgoing email | Local only |

- **One app image, two processes.** `web` and `worker` run the same code with different start commands, so they always deploy together and share Prisma and the AI code.
- **Single origin in production.** Express serves the React build, so the frontend and API share one domain. Session cookies stay first-party and no CORS config is needed.
- **Multi-stage Dockerfile:** build client and server in a full Node image, copy only the output and production dependencies into a slim runtime image, run as a non-root user.
- **Migrations:** `prisma migrate deploy` runs as a release step before new containers start, never on app startup.
- **Config:** all settings come from environment variables; secrets are set in the cloud provider, never baked into the image.

### Compose files
- `docker-compose.yml`: development. Postgres and Mailpit only; client and server run on your machine with hot reload.
- `docker-compose.prod.yml`: production-like test. Runs `web`, `worker`, `postgres`, and `mailpit` from the built image.

### Cloud provider
**Recommended: Render or Railway.** Both deploy straight from a Dockerfile or GitHub repo, offer managed Postgres, run background workers, provide HTTPS, and have free or low-cost tiers. Setup takes minutes, so time goes into testing the app rather than infrastructure.

**Alternative: AWS (ECS Fargate + RDS + ECR)** or **Google Cloud Run + Cloud SQL**, if you also want to learn a major cloud platform. Expect more setup (networking, IAM, load balancer) and higher baseline cost.

### CI/CD
GitHub Actions: lint, type-check, test, and build the Docker image on every push; deploy from `main` after checks pass.

## Project structure

```
helpdesk/
├── client/                 # React + Vite app
│   └── src/
│       ├── pages/          # Login, Dashboard, Tickets, TicketDetail, Users
│       ├── components/     # shadcn/ui + app components
│       └── api/            # API client + TanStack Query hooks
├── server/                 # Express API
│   ├── prisma/             # schema.prisma, migrations, seed
│   └── src/
│       ├── routes/         # tickets, users, dashboard, webhooks
│       ├── auth/           # Better Auth config, requireAuth/requireAdmin
│       ├── ai/             # classify, summarize, reply, prompts
│       ├── email/          # inbound parsing, outbound sending
│       └── jobs/           # pg-boss workers
├── knowledge-base/         # Markdown articles (general/, refund/, technical/)
├── evals/                  # sample emails + expected results, eval script
├── .github/workflows/      # CI: lint, test, build, deploy
├── Dockerfile              # multi-stage build for web + worker
├── .dockerignore
├── docker-compose.yml      # dev: Postgres, Mailpit
└── docker-compose.prod.yml # production-like: web, worker, Postgres, Mailpit
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret for signing session cookies |
| `BETTER_AUTH_URL` | Base URL of the API |
| `ANTHROPIC_API_KEY` | Claude API key |
| `POSTMARK_SERVER_TOKEN` | Postmark API token for sending |
| `POSTMARK_INBOUND_SECRET` | Shared secret to verify inbound webhook requests |
| `SUPPORT_EMAIL` | The support address replies are sent from |
| `CLIENT_URL` | Frontend URL (for CORS and cookies) |
