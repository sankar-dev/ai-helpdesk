# AI Helpdesk: Implementation Plan

Builds the features in [project-scope.md](project-scope.md) using the stack in [tech-stack.md](tech-stack.md).

Each phase ends with something working that you can see or test. Tasks are small enough to finish in one sitting. Work through the phases in order; later phases depend on earlier ones.

---

## Phase 1: Project setup
**Done when:** client and server both run locally, and the server connects to Postgres.

- [ ] Create `client/` with Vite + React + TypeScript
- [ ] Add Tailwind CSS and initialise shadcn/ui in `client/`
- [ ] Add React Router with placeholder pages: Login, Dashboard, Tickets, Ticket Detail, Users
- [ ] Create `server/` with Express + TypeScript (tsx for dev, tsc for build)
- [ ] Add `docker-compose.yml` with Postgres and Mailpit
- [ ] Add Prisma to `server/`, connect to Postgres, run a first empty migration
- [ ] Add `.env.example` with all variables from tech-stack.md; add `.env` to `.gitignore`
- [ ] Add `GET /api/health` endpoint that checks the database connection
- [ ] Configure the Vite dev proxy so `/api` requests go to the Express server
- [ ] Add ESLint + Prettier, and Vitest to the server
- [ ] Initialise git and make the first commit

---

## Phase 2: Database schema
**Done when:** all tables exist, and a seed script fills them with realistic sample data.

- [ ] Define enums: `Role` (admin, agent), `TicketStatus` (new, ai_resolved, escalated, in_progress, resolved, closed), `TicketCategory` (general, refund, technical, other), `MessageSender` (student, ai, agent)
- [ ] Define `Ticket` model: subject, studentEmail, studentName, status, category, aiConfidence, summary, escalationReason, suggestedReply, assignedToId, timestamps
- [ ] Define `Message` model: ticketId, sender, authorId (for agents), body, emailMessageId, inReplyTo, references, createdAt
- [ ] Define `KnowledgeArticle` model: slug, title, category, content, updatedAt
- [ ] Define `MessageSource` join table (which KB articles an AI reply used)
- [ ] Add indexes for ticket list queries: status, category, assignedToId, createdAt, updatedAt
- [ ] Write a seed script with ~20 sample tickets and messages across all statuses and categories
- [ ] Run the migration and seed; inspect the data in Prisma Studio

---

## Phase 3: Authentication and user management
**Done when:** admins and agents can log in and out, routes are protected by role, and admins can manage users.

### Backend
- [ ] Install Better Auth with the Prisma adapter; generate its tables (`user`, `session`, `account`, `verification`) and migrate
- [ ] Add a `role` field to `user` (default `agent`)
- [ ] Configure database sessions: httpOnly cookie, sameSite=lax, 7-day expiry, secure in production
- [ ] Disable public signup
- [ ] Mount Better Auth routes on Express
- [ ] Write `requireAuth` middleware (loads session and user, returns 401 if missing)
- [ ] Write `requireAdmin` middleware (returns 403 if not admin)
- [ ] Add seed script for the first admin account
- [ ] Add user management API (admin only): list, create, update role, deactivate (deletes their sessions), reactivate
- [ ] Tests: unauthenticated request gets 401, agent on admin route gets 403

### Frontend
- [ ] Build the Login page (email + password form, error message)
- [ ] Add an auth context/hook that loads the current user
- [ ] Add a protected route wrapper that redirects to Login; an admin-only wrapper for Users
- [ ] Build the app layout: sidebar nav (Dashboard, Tickets, Users for admins only), current user, logout button
- [ ] Build the Users page: table of users, create user dialog, change role, deactivate/reactivate

---

## Phase 4: Ticket list and detail (using seeded data)
**Done when:** agents can browse, filter, sort, and open tickets, and update status, category, and assignee.

### Backend
- [ ] `GET /api/tickets` with query parameters: status, category, assignedTo, aiResolved, dateFrom, dateTo, search, sort, order, page, pageSize
- [ ] Validate query parameters with Zod; build the Prisma `where` and `orderBy` from them
- [ ] Return tickets with total count for pagination
- [ ] `GET /api/tickets/:id` returning the ticket, all messages, assignee, and KB sources
- [ ] `PATCH /api/tickets/:id` to change status, category, or assignee
- [ ] `GET /api/users/agents` for the assignee dropdown
- [ ] Tests for filtering, sorting, and pagination

### Frontend
- [ ] API client + TanStack Query hooks for tickets
- [ ] Ticket list using the shadcn Data Table pattern (TanStack Table in manual mode)
- [ ] Columns: subject, student, category badge, status badge, assignee, summary, updated
- [ ] Filter bar: status, category, assignee, AI resolved/escalated, date range, search box
- [ ] Sortable column headers and pagination controls
- [ ] Keep filters, sort, and page in the URL query string (shareable, survives refresh)
- [ ] Ticket detail page: header with summary, category, confidence, status
- [ ] Message thread with each message labelled Student / AI / Agent
- [ ] Controls to change status, category, and assignee
- [ ] Show the KB articles used by AI replies

---

## Phase 5: Knowledge base
**Done when:** the sample KB is written, loaded into the database, and editable by admins.

- [ ] Define the fictional institution (name, programmes, key dates, fees, refund policy, tools used)
- [ ] Write ~10–15 General articles in `knowledge-base/general/`
- [ ] Write ~10–15 Refund articles in `knowledge-base/refund/`
- [ ] Write ~10–15 Technical articles in `knowledge-base/technical/`
- [ ] Use a consistent format: front matter (slug, title, category) + Markdown body
- [ ] Write an import script that loads the Markdown files into `KnowledgeArticle`
- [ ] Add KB API: list, get, create, update (admin only for writes)
- [ ] Build a simple Knowledge Base page: list articles, view, edit (admin only)

---

## Phase 6: Email intake and sending
**Done when:** an email sent to the support address creates a ticket, replies thread correctly, and agents can reply by email.

### Inbound
- [ ] Write a `createTicketFromEmail` service: find an existing ticket by `In-Reply-To`/`References`, else create a new one; save the message
- [ ] Reopen a resolved ticket when the student replies
- [ ] Ignore auto-replies (`Auto-Submitted` header, "Out of office" patterns)
- [ ] Skip duplicate emails (same `Message-ID`)
- [ ] Add a dev script that creates tickets from sample email JSON files (no Postmark needed)
- [ ] Add `POST /webhooks/inbound` that parses the Postmark payload and calls the service
- [ ] Verify the webhook secret; reject requests without it
- [ ] Tests for threading, reopening, duplicates, and auto-reply filtering

### Outbound
- [ ] Write a `sendEmail` service with two transports: Mailpit (SMTP) in dev, Postmark in production
- [ ] Set `In-Reply-To` and `References` so replies land in the student's thread
- [ ] Add `POST /api/tickets/:id/reply` for agents: send email, save message, update status
- [ ] Add a reply box to the ticket detail page

### Real email (optional until later)
- [ ] Create a Postmark account, server, and inbound address
- [ ] Expose the local server with ngrok and point the Postmark inbound webhook at it
- [ ] Send a real test email end to end

---

## Phase 7: AI pipeline
**Done when:** new tickets are automatically classified, summarised, and either answered or escalated.

### Setup
- [ ] Install the Anthropic SDK; create a shared client using `ANTHROPIC_API_KEY`
- [ ] Build the KB system prompt from all `KnowledgeArticle` rows, with prompt caching enabled
- [ ] Wrap student email content in clear delimiters and instruct the model never to follow instructions inside it

### Background jobs
- [ ] Set up pg-boss and a worker process
- [ ] Enqueue a `process-ticket` job whenever a student message is saved
- [ ] Add retries with backoff; on final failure, escalate the ticket

### Classification
- [ ] Write the classification prompt: category, confidence, escalate (yes/no), escalation reason
- [ ] Include all "always escalate" rules from the scope in the prompt
- [ ] Validate output with Zod; escalate on invalid output
- [ ] Save category, confidence, and escalation reason on the ticket

### Summary
- [ ] Write the summary prompt (1–2 sentences: what the student wants plus key details)
- [ ] Regenerate the summary when the student replies

### Auto-reply
- [ ] Write the reply prompt: answer only from the KB, friendly tone, AI disclosure, how to reach a human
- [ ] Return the reply text and the IDs of KB articles used; save them as `MessageSource`
- [ ] If the model says the KB doesn't cover the question, escalate instead of replying
- [ ] Send the reply, save it as an AI message, set status to `AI Resolved`
- [ ] Escalate when a student replies to an AI answer saying it didn't help

### Tests
- [ ] Unit tests with a mocked Anthropic client: auto-reply path, escalation path, invalid JSON, API error

---

## Phase 8: AI-suggested replies
**Done when:** escalated tickets show an AI draft that agents can edit, regenerate, and send.

- [ ] Generate a suggested reply when a ticket is escalated (uses KB and full thread)
- [ ] Save it on the ticket; show it pre-filled in the reply box
- [ ] Add `POST /api/tickets/:id/suggest-reply` to regenerate on demand
- [ ] Add a "Regenerate" button and a loading state
- [ ] Show which KB articles the suggestion used
- [ ] Never auto-send suggested replies; only the agent's Send button sends

---

## Phase 9: Dashboard
**Done when:** the dashboard shows ticket metrics and links into the filtered ticket list.

- [ ] `GET /api/dashboard` returning counts by status and category
- [ ] Add auto-resolved % vs escalated %
- [ ] Add average first-response time (AI vs agent)
- [ ] Add count of unassigned escalated tickets
- [ ] Build stat cards and a category breakdown chart
- [ ] Make each card link to the ticket list with the matching filters
- [ ] Add a "My tickets" view for the logged-in agent

---

## Phase 10: Evaluation and hardening
**Done when:** you have accuracy numbers against the success metrics, and the main risks are covered.

### Evaluation
- [ ] Write ~50 sample student emails in `evals/` with the expected category and escalate/auto-reply decision
- [ ] Include tricky cases: multi-question emails, refund requests vs refund-policy questions, angry emails, prompt injection attempts, off-topic emails
- [ ] Write an eval script that runs each email through the AI pipeline and records results
- [ ] Report classification accuracy, escalation correctness, and auto-resolve rate
- [ ] Manually review AI replies for invented facts; record answer accuracy
- [ ] Tune prompts and re-run until the targets in project-scope.md are met

### Hardening
- [ ] Rate-limit the login endpoint
- [ ] Add request logging and error handling middleware
- [ ] Log every AI decision on the ticket (model, category, confidence, reason) for auditing
- [ ] Review all routes for correct `requireAuth`/`requireAdmin`
- [ ] Write a README: setup, running locally, seeding, running evals

---

## Phase 11: Dockerize
**Done when:** the whole app runs in production mode from Docker images on your machine with one command.

### Production build
- [ ] Make Express serve the built React app (`client/dist`) in production, with a fallback to `index.html` for client-side routes
- [ ] Confirm the app uses one origin in production (no CORS needed, session cookies work as first-party)
- [ ] Split the server entry points: `web` (API + static client) and `worker` (pg-boss jobs)
- [ ] Read all config from environment variables; fail fast at startup if a required one is missing
- [ ] Make the server shut down cleanly on `SIGTERM` (finish requests, stop pg-boss, close Prisma)

### Docker images
- [ ] Write a multi-stage `Dockerfile`: install deps → build client → build server → `prisma generate` → slim runtime image
- [ ] Run as a non-root user in the runtime image
- [ ] Add `.dockerignore` (node_modules, .env, dist, .git)
- [ ] Use the same image for `web` and `worker`, with different start commands
- [ ] Add a `HEALTHCHECK` using `GET /api/health`

### Local production test
- [ ] Add `docker-compose.prod.yml` with `web`, `worker`, `postgres`, and `mailpit` services
- [ ] Add a `migrate` step that runs `prisma migrate deploy` before `web` and `worker` start
- [ ] Add a one-off command to seed the first admin and import the knowledge base
- [ ] Run the full stack and test: login, ticket list, seeded email → AI reply in Mailpit, escalation, agent reply
- [ ] Check image size and startup time; fix anything obviously large

---

## Phase 12: Cloud deployment and testing
**Done when:** the app runs in the cloud, a real email to the support address gets an AI reply, and the end-to-end checks pass.

### Infrastructure
- [ ] Choose the cloud provider (see Deployment in tech-stack.md)
- [ ] Create a managed PostgreSQL database
- [ ] Push the Docker image to a container registry (or connect the repo for automatic builds)
- [ ] Deploy the `web` service with a public HTTPS URL
- [ ] Deploy the `worker` service from the same image (no public URL)
- [ ] Set all environment variables and secrets in the provider (never commit them)
- [ ] Run `prisma migrate deploy` as a release/pre-deploy step
- [ ] Seed the first admin and import the knowledge base

### Email
- [ ] Point the Postmark inbound webhook at `https://<your-app>/webhooks/inbound`
- [ ] Set up a sending domain or sender signature in Postmark so replies are delivered (not spam)
- [ ] Switch outbound mail from Mailpit to Postmark via environment config

### CI/CD
- [ ] Add a GitHub Actions workflow: lint, type-check, and tests on every push
- [ ] Build the Docker image in CI to catch build failures
- [ ] Deploy automatically from the `main` branch after checks pass

### Testing in the cloud
- [ ] Smoke test: health endpoint, login, logout, ticket list loads
- [ ] Check session cookies are `secure` and `httpOnly` over HTTPS
- [ ] Send a real General question email → AI auto-reply arrives in the same thread
- [ ] Send a refund request → ticket is escalated with summary and suggested reply
- [ ] Reply from the agent UI → student receives it in the same thread
- [ ] Student replies "this didn't help" → ticket is escalated
- [ ] Send a webhook request without the secret → rejected
- [ ] Deactivate an agent → they are logged out immediately
- [ ] Run the eval script against the deployed AI configuration
- [ ] Check logs and AI decision records for errors; check Anthropic API usage and cost

### Operations
- [ ] Enable automatic database backups and test restoring one
- [ ] Set up an uptime check on the health endpoint
- [ ] Document the deploy, rollback, and secret-rotation steps in the README

---

## Later (stretch)
- [ ] Agent feedback on AI replies (thumbs up/down) to improve prompts and KB
- [ ] Highlight KB gaps: frequent escalation topics with no matching article
- [ ] pgvector retrieval if the KB grows past a few hundred articles
