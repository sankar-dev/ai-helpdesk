# AI Helpdesk: Project Scope

> **Type:** Learning project, not a production deployment. Real-world concerns (compliance, scale, identity verification) are simplified or mocked, but the design should still show how they *would* be handled.

## Problem
1. Students wait too long for a response.
2. Many questions are repetitive, and agents currently answer them by hand using canned responses.

## Solution
1. A ticketing system, built from scratch, where incoming student emails become tickets.
2. AI classifies and summarizes each ticket, answers it automatically when it can, and escalates complex ones to a human agent.
3. For escalated tickets, AI suggests a reply that the agent can edit and send.

## Goals
- Build a working ticketing system with AI auto-reply and escalation.
- Get correct, knowledge-base-grounded answers instead of canned responses.
- Learn how to build an end-to-end AI application (classification, retrieval, generation, human handoff).

## Non-goals (v1)
- Integrating with a real student information system (SIS) or payment system.
- Actually processing refunds. AI explains the refund policy and process; it does not approve or issue refunds.
- Answering questions about a specific student's account (e.g. "has my payment gone through?"). These are escalated.
- Channels other than email (chat, WhatsApp, phone).
- Multi-language support.
- Student-facing portal. Students interact only by email.

## Users
| Role | What they do |
|---|---|
| **Student** | Sends an email, receives an AI or agent reply by email, can reply on the same thread. No login. |
| **Agent** | Logs in, works escalated tickets, uses AI-suggested replies, can review AI-sent replies. |
| **Admin** | Everything an agent can do, plus managing users and the knowledge base. |

## Question categories
| Category | Examples | AI handling |
|---|---|---|
| **General** | Deadlines, office hours, course registration, documents needed | Auto-reply if answered by the knowledge base |
| **Refund** | Refund policy, eligibility, timelines, how to request one | Auto-reply for *policy/process* questions. Escalate requests to actually process a refund, or anything disputed |
| **Technical** | Portal login, password reset, LMS access, video not loading | Auto-reply for known issues with documented fixes. Escalate unknown issues or bugs |

Anything that doesn't fit these categories is classified as **Other** and escalated.

## Features

### 1. Receive support emails and create tickets
- Incoming emails to the support address create a new ticket.
- Replies on the same email thread attach to the existing ticket (matched by thread/message ID) instead of creating a new one.
- Ticket fields: student email, subject, body, category, status, summary, assigned agent, conversation history, AI confidence, timestamps.
- Ticket statuses: `New` → `AI Resolved` / `Escalated` → `In Progress` → `Resolved` → `Closed`. A resolved ticket reopens if the student replies.
- Ignore out-of-office/auto-replies; detect duplicate emails.
- For local development and testing, a way to create tickets from seeded sample emails without a real inbox.

### 2. AI-powered ticket classification
- Every new ticket is classified into **General**, **Refund**, **Technical**, or **Other**.
- Classification also decides whether the ticket can be **auto-replied** or must be **escalated** (see escalation rules below).
- Category and confidence are stored on the ticket and visible to agents; agents can correct the category.

### 3. AI summaries
- Every ticket gets a short AI summary (1–2 sentences: what the student wants and any key details).
- Summary is shown in the ticket list and at the top of the ticket detail view.
- Summary is regenerated when the student replies, so long threads stay easy to scan.

### 4. Auto-generate human-friendly responses using a knowledge base
1. Retrieve relevant knowledge base articles for the ticket.
2. If the answer is in the knowledge base and confidence is high, generate a friendly, clear reply and send it automatically. Ticket moves to `AI Resolved`.
3. Otherwise, escalate the ticket to the agent queue.

**Always escalate when:**
- The knowledge base doesn't contain the answer, or AI confidence is low.
- The student asks to talk to a human.
- The question is account-specific (needs the student's personal records).
- The student requests an actual refund action, or the email is a complaint or dispute.
- The email shows distress, anger, or urgency (sensitive or emotional topics).
- The student replies to an AI answer saying it didn't help.
- The email contains multiple questions and any of them can't be answered.

**Response rules:**
- Answers only from the knowledge base; never invents policies, dates, or amounts.
- Warm, plain-language tone, not a copy-pasted canned response.
- Every AI reply says it was AI-generated and tells the student how to reach a human.
- Ignores instructions embedded in the student's email (prompt injection protection).

### 5. AI-suggested replies
- For escalated tickets, AI drafts a suggested reply using the knowledge base and the conversation history.
- Agent can use it as-is, edit it, regenerate it, or write their own.
- **Nothing is sent without agent approval.**

### 6. Ticket list with filtering and sorting
- Shows all tickets with subject, student email, category, status, assigned agent, AI summary, and created/updated time.
- **Filter by:** status, category, assigned agent, date range, AI-resolved vs escalated.
- **Sort by:** created date, last updated, status.
- Search by student email or subject.

### 7. Ticket detail view
- Full email thread (student messages, AI replies, agent replies), clearly labelled by sender.
- AI summary, category, confidence, and status at the top.
- Reply box with the AI-suggested reply.
- Actions: change status, change category, assign/reassign agent.
- The knowledge base articles the AI used, so agents can check its answer.

### 8. Dashboard to view and manage all tickets
- Counts by status and category (open, escalated, AI resolved, closed).
- Auto-resolved % vs escalated %.
- Average first-response time (AI vs agent).
- Unassigned escalated tickets, so nothing gets missed.
- Quick links into the filtered ticket list.

### 9. User management (admin only)
- Admin can create, edit, and deactivate agent and admin accounts.
- Roles: **Admin** and **Agent**. Only admins see the user management pages.
- Login required for all agent and admin pages.

## Knowledge base
- A **sample knowledge base** for a fictional institution, created as part of this project.
- Format: Markdown articles (one topic per file), each with title, category, and content.
- Initial content: ~10–15 articles per category (General, Refund, Technical).
- Admin can add or edit articles; changes take effect for new tickets.

## Success metrics
| Metric | Target (for test data) |
|---|---|
| Auto-resolve rate | ≥ 50% of tickets |
| Classification accuracy | ≥ 90% on the test set |
| Answer accuracy (on a test set of sample emails) | ≥ 90% correct, 0 invented policies |
| Correct escalation | 100% of "always escalate" cases escalated |
| First-response time for AI-resolved tickets | < 1 minute |

## Phases
1. **Foundation:** data model, login and user management, ticket list, ticket detail view, sample knowledge base.
2. **Email intake:** create tickets from seeded sample emails, then from a real inbox; thread matching.
3. **AI core:** classification, summaries, auto-reply from the knowledge base, escalation rules.
4. **Agent assist:** AI-suggested replies for escalated tickets.
5. **Dashboard:** ticket metrics and quick filters.
6. **Evaluation:** test set of sample student emails, measured against the success metrics.

## Tech stack
See [tech-stack.md](tech-stack.md). React, Node.js/Express, PostgreSQL, database-session auth, Postmark for email, Claude for AI.

## Open questions
- Should agents be able to review or correct AI-sent replies after the fact?
- How will the test set of sample emails be created, and how many?
