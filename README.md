# URL Workspace

A React + TypeScript practice implementation of the URL summarization frontend challenge. Paste a public webpage URL, watch a **real Gemini response stream**, revisit saved summaries, search the source and summary, and ask follow-up questions in a session-scoped chat.

## Live demo

[Open the deployed URL Workspace demo](https://url-summarization-workspace.manu-moran0710.workers.dev/)

The dark gradient, compact session list, translucent pill controls, reading surface, and chat panel follow the [original Figma reference](https://www.figma.com/design/ltkR4niWxYqLJ0ELvnOhp4/FE-challenge). The layout adapts to small screens with accessible sidebar sheets.

## Run locally

Requires **Node.js 22.13+** and npm.

```sh
npm install
cp .env.example .env
# Set GEMINI_API_KEY in .env (never commit it).
npm run db:migrate
npm run dev
```

Open http://localhost:3000. The project uses **Vinext**, which provides Next.js-style App Router conventions on Vite and Cloudflare Workers. The local D1 database lives in the ignored `.wrangler/state` directory. `npm run db:migrate` applies only local migrations; it does not contact a production database.

### Connect a real model

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Put it in `.env` as `GEMINI_API_KEY=your-key` and restart the dev server.
3. Set `GEMINI_MODEL` to a streaming text model available in your account. The default is `gemini-3.6-flash`; model access and quotas depend on the account.
4. Submit a public, text-heavy article. Verify that text appears progressively and remains after reloading.

The key is read **only on the server**, never embedded in client code or accepted in a browser form. Hosted deployments require the same variables to be configured as server secrets; a local `.env` is never uploaded. An API account may require billing or have limited quota; check your account before use.

**There are no simulated production responses.** Without a key, the app displays setup guidance and the generation endpoint returns HTTP 503 before creating a session. The successful live-provider path must be verified after a key is configured. Tests use explicitly isolated provider fixtures to exercise transport and persistence without spending credits.

## Product behavior

- Streamed summaries, with durable partial-text checkpoints and explicit completion/error states.
- Search as you type (200 ms debounce) over URL, title, summary, and fetched source.
- Persisted session metadata and chat messages in SQLite/D1.
- Copy Markdown, download a `.md` file with source metadata, and delete a session with confirmation.
- Follow-up chat uses the stored webpage, its summary, and the most recent 10 complete exchanges.
- Clear errors for invalid/private URLs, redirects, missing content, unsupported media, timeouts, provider failures, quota errors, and disconnects.
- Stop a running request; its already-generated text is retained.

### Thoughtful improvement: recoverable generation

A network failure should not erase something useful. The server checkpoints streamed text approximately every 800 ms, saves it on a handled failure, and uses an expiring database lease to detect abandoned requests after a reload. A failed summary can be retried in the same session. The previous partial result stays visible until the retry produces its first token. This improves resilience while keeping the session list free of duplicate retries.

## Structure and decisions

```text
app/api/                  Thin HTTP handlers and route contracts
components/workspace/     Product UI and safe Markdown rendering
components/ui/            Starter-provided accessible primitives
hooks/use-workspace.ts    Client state, stale-response protection, streaming lifecycle
lib/server/repository.ts  Prepared D1 queries and generation leases
lib/server/webpage.ts     Public URL validation, bounded fetching, text extraction
lib/server/llm.ts         Real Gemini SSE adapter and bounded source-grounded prompts
lib/server/summary.ts     Summary orchestration and durable checkpoints
lib/sse.ts                Shared incremental SSE parser
lib/types.ts              Session, message, and stream-event contracts
db/schema.ts + drizzle/   Schema and generated migrations
tests/                    Transport, extraction, and API/SQLite contract tests
```

- **API boundaries:** frontend components never access the database or provider directly. Native `fetch` and `ReadableStream` avoid an unnecessary provider SDK abstraction.
- **Persistence:** D1 provides SQLite locally and durable storage when hosted. Prepared statements bind user input. Source content is retained to support search and grounded chat.
- **Identity:** a cryptographically random, HttpOnly, SameSite cookie scopes every session query to one browser workspace. This is intentionally lightweight practice identity, not an account system. Clearing cookies loses access to that workspace; devices do not sync. Do not treat it as production authentication.
- **State:** summary status is a discriminated union (`fetching`, `streaming`, `complete`, `error`); messages have separate status. There is one active request per browser UI, with a database lease to protect each session against concurrent server requests. Expired leases recover in at most three minutes.
- **Streaming:** newline-delimited SSE events wrap JSON. A shared decoder handles fragmented UTF-8, CRLF, multiline data, and final events. A missing completion event is an error, not an implicit success.
- **Web content:** readable article extraction uses Mozilla Readability with a DOM fallback. Fetching does not execute remote scripts. The app does not support login-only pages, JavaScript-only pages, PDFs. Pages are limited to 2 MB, source context to 60,000 characters (explicitly disclosed in the UI), and generation to 120 seconds.
- **Rendering:** Markdown renders without raw HTML or remote images; links are sanitized by `react-markdown` and open with `noopener noreferrer`.
- **Costs:** per-workspace storage is bounded to 100 sessions and 50 chat questions per session. These are practice guardrails, not abuse-proof rate limiting. A public production service needs authenticated users, IP/account rate limiting and a provider spending limit before exposing a funded key.
- **Optional agent access:** supported browsers receive three imperative WebMCP tools using the same APIs and UI actions. Unsupported browsers work normally. Tool registration, empty-list reads, invalid-input rejection, and missing-session errors were checked in the browser. Successful creation/opening through these tools still needs a configured provider and saved session.

## HTTP API

| Method | Endpoint                  | Behavior                                             |
| ------ | ------------------------- | ---------------------------------------------------- |
| GET    | `/api/config`             | Provider configuration status; never returns secrets |
| GET    | `/api/sessions?q=...`     | List/search the browser workspace                    |
| POST   | `/api/sessions`           | `{ "url": "https://..." }`; create and stream        |
| GET    | `/api/sessions/:id`       | Summary, metadata, and persisted messages            |
| DELETE | `/api/sessions/:id`       | Delete session and cascade its messages              |
| POST   | `/api/sessions/:id/retry` | Retry an interrupted summary                         |
| POST   | `/api/sessions/:id/chat`  | `{ "content": "question" }`; persist and stream chat |

Streaming responses are `text/event-stream` and emit `session` / `message`, `delta`, and a terminal `done` or `error` event. An error before streaming uses an HTTP error status and `{ "error": "message" }`. An error after headers are sent uses a terminal SSE error and a saved error state.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests exercise split UTF-8/SSE frames, extraction, private-address and redirect rejection, API persistence against an actual in-memory SQLite database, owner isolation, search, deletion cascades, chat persistence, failed-stream checkpoints, retry preservation, and expired leases. Provider fixtures exist only in the test suite. Lint covers application and test code; untouched starter UI primitives and their mobile hook are excluded because the starter’s own lint rules report existing errors in those vendored files.

After configuring a real key, manually check:

1. Create a public article summary and verify progressive output, then reload.
2. Ask a follow-up, close/reopen chat, and confirm both messages remain.
3. Search by a term from the source, then copy, download and delete.
4. Stop a request, reload, and retry after the abandoned-request lease expires if necessary.
5. Test on a narrow screen and compare all states with Figma.

## With more time

- Verify design measurements/font assets through full Figma inspection and run browser interaction/accessibility tests across widths.
- Add real authentication, cross-device workspaces, spending quotas, and robust public-service rate limiting.
- Move long-running generation into durable jobs so it can continue independently of browser connections.
- Use a hardened fetch proxy with pinned DNS resolution for deployments outside Cloudflare Workers; the current DNS preflight is defense in depth, not a general DNS-rebinding solution.
- Add page-to-answer citations and source-section navigation; improve extraction for complex sites.

## Deployment

`npm run build` emits the Cloudflare-compatible server and assets. The `.openai/hosting.json` manifest declares the logical D1 binding; Sites provisions the real database and applies generated migrations. The practice preview is private by default. This project does not automatically create a GitHub submission or invite reviewers.

Never publish `.env`, `.wrangler`, API keys, session data, or generated dependency/build folders to GitHub. For an eventual submission, create a private GitHub repository, configure deployment secrets, verify a live LLM response, and then intentionally provide the required public preview and collaborator access.
