# IoT Operations Assistant

A GenAI-enabled IoT operations application built with NestJS, TypeScript, and
the Google GenAI SDK. It demonstrates how probabilistic LLM reasoning can be
combined with deterministic backend services, grounded enterprise knowledge,
controlled side effects, human approval, evaluation, and execution tracing.

The project focuses on production-oriented application boundaries and safety
controls. It is intentionally limited in infrastructure scope and should not be
treated as a production-ready deployment.

## Core principle

> Probabilistic reasoning, deterministic execution.

The model interprets natural-language intent, selects capabilities, combines
evidence, and may propose an action. The application owns service boundaries,
validates arguments, limits the model/tool loop, controls side effects, and
records execution traces. A human authorizes sensitive work, and a deterministic
service performs the approved business operation.

**An LLM tool call is not execution authority.**

## What this project demonstrates

- A generic connected-device domain with separate device identity, telemetry,
  and event models.
- A Gemini boundary that prevents SDK-specific types and lifecycle details from
  spreading through the application.
- A bounded, multi-round function-calling loop with explicit tool dispatch.
- Read-only tools for device identity, latest telemetry, and recent events.
- An assistant-side MCP client that discovers the required READ contracts and a
  read-only stdio server exposing deterministic device, telemetry, and event
  services over protocol version `2026-07-28`.
- Retrieval-augmented generation over an internal maintenance guide using
  Markdown-aware chunking, Gemini embeddings, an in-memory vector store, and
  cosine-similarity search.
- Combined tool and RAG orchestration: live structured facts and static
  maintenance knowledge remain distinct evidence sources.
- Prompt-level grounding rules that separate observations, documented guidance,
  and interpretation.
- A side-effecting maintenance workflow in which Gemini can create a frozen
  `PendingAction` proposal but cannot execute the work order.
- Human approval followed by deterministic, idempotent execution without another
  Gemini call.
- Google OIDC login, protected stateless local sessions, authenticated decisions
  with actor attribution, and local application logout.
- Structured interaction traces and evaluation suites covering behavior,
  application state, and trace structure.
- A validated HTTP assistant boundary with interaction correlation, sanitized
  failure responses, and operational error logging.

## Architecture at a glance

```text
                              probabilistic reasoning
POST /ai/device-assistant
     |
     v
request validation -> HTTP adapter -> correlated/sanitized response
     |
     v
+----------------------+        +----------------------+
| DeviceAssistantService|<------>| GeminiClientService  |
| bounded tool loop     |        | Google GenAI SDK     |
+----------+-----------+        +----------------------+
           |
           v
+-----------------------------+          interaction trace
| Tool dispatcher             |--------> model turns, tool calls,
| READ | RETRIEVAL | PROPOSAL |          retrieval and proposals
+-----+----------+------------+
      |          |
      |          +--> maintenance knowledge retrieval
      |               Markdown -> chunks -> embeddings -> vector search
      |
      +--> MCP tools/list -> required READ policy -> Gemini tool adapter
      +--> MCP-backed READ executor -> stdio MCP server
                                      -> deterministic device / telemetry / event services

ACTION_PROPOSAL
      |
      v
+------------------+    human decision    +----------------------+
| frozen           |--------------------->| approval service     |
| PendingAction    |                      | no Gemini call       |
+------------------+                      +----------+-----------+
                                                   |
                                                   v
                                        MaintenanceWorkOrdersService
                                           deterministic execution

Evaluation: behavioral expectations + state assertions + trace assertions
```

The model-facing tool classes make authority visible:

| Tool class | Purpose | Side-effect authority |
| --- | --- | --- |
| `READ` | Read current structured device facts | None |
| `RETRIEVAL` | Retrieve relevant maintenance knowledge | None |
| `ACTION_PROPOSAL` | Create a reviewable pending action | Proposal only |

See [docs/architecture.md](docs/architecture.md) for detailed flows, design
decisions, and trade-offs.

## Representative flows

### Read-only investigation

1. The user asks about a device.
2. The host discovers MCP tools, selects the required authorized READ
   contracts, and adapts them into Gemini function declarations.
3. Gemini requests the device, telemetry, or event tools it needs.
4. The application dispatches each read call through the MCP client to the
   stdio MCP server, which validates it and invokes existing NestJS services.
5. Structured results are returned to the same Gemini interaction.
6. Gemini synthesizes a grounded answer within a bounded number of rounds.

### Tools plus maintenance knowledge

1. Gemini retrieves current device evidence through read tools.
2. When guidance is required, it invokes maintenance knowledge retrieval.
3. The RAG subsystem embeds the query and returns ranked document chunks.
4. Gemini combines current observations with documented guidance while keeping
   their source boundaries explicit.

### Human-approved side effect

1. Gemini proposes `create_maintenance_work_order` with evidence-based arguments.
2. The application validates the request and stores an immutable argument
   snapshot as a `PendingAction`.
3. The interaction ends with `APPROVAL_REQUIRED`; no work order exists yet.
4. A human approves or rejects the pending action.
5. Approval executes the frozen payload through
   `MaintenanceWorkOrdersService`, without asking Gemini to reconstruct it.
6. Repeated approval returns the existing result instead of executing twice.

## Safety and control model

- Tool schemas constrain model-supplied arguments.
- Unknown tools and invalid arguments fail explicitly.
- The orchestration loop is capped at five tool rounds.
- Missing telemetry or events are not treated as proof of device state.
- Numeric readings are not classified without relevant baselines or thresholds.
- Retrieved guidance is evidence, not proof of a device-specific root cause.
- Read, retrieval, and action-proposal capabilities have distinct categories.
- Side effects require a durable conceptual boundary: proposal first, explicit
  approval second, deterministic execution last.
- Approval uses the originally validated, frozen payload and does not invoke the
  model again.

These controls reduce risk; they do not make model output deterministic or
eliminate hallucinations.

## Evaluation

The repository uses Vitest-based evaluation suites rather than treating normal
unit tests as sufficient evidence of AI behavior. The suites exercise:

- baseline device-assistant behavior and grounding;
- standalone retrieval and RAG answer generation;
- tool-only, RAG-only, and combined orchestration;
- action proposal, approval, rejection, and duplicate approval behavior;
- trace contents, counts, categories, outcomes, and minimal failure capture.

Some assertions are deterministic—for example tool selection constraints,
pending-action state, idempotent approval, and trace structure. Natural-language
answer quality remains probabilistic and still benefits from manual review. The
project deliberately does not use an LLM as a judge.

## Observability

`AiTraceService` records an in-memory `AiInteractionTrace` spanning:

- interaction ID, input, timing, and final outcome;
- model and tool-call counts;
- per-round model latency;
- tool name, category, arguments, latency, status, and bounded error details;
- retrieval query and ranked chunk metadata;
- action proposal IDs and approval-required outcomes.

Traces describe what the application did. They support debugging and
trace-based evaluation, but they do not automatically determine whether a
natural-language answer is good. Raw chain-of-thought is neither requested nor
stored.

## Capability matrix

| Capability | Implementation | Evidence / control | Current limitation |
| --- | --- | --- | --- |
| Device facts | NestJS device, telemetry, and event services | Typed models and deterministic mock data | In-memory data only |
| Function calling | Gemini Interactions API and normalized boundary types | Explicit schemas and dispatcher | Single provider/model configuration |
| Agentic loop | `DeviceAssistantService` | Maximum five tool rounds | No long-running or resumable workflow |
| RAG retrieval | Markdown chunking, Gemini embeddings, cosine similarity | Ranked chunk metadata | One local document; in-memory index |
| Grounded generation | System instructions and explicit evidence boundaries | Evaluation cases for unsupported inference | Prompt constraints are not a formal guarantee |
| Combined orchestration | Read, retrieval, and proposal tools | Tool-category and trace assertions | Model chooses capabilities probabilistically |
| Human-in-the-loop action | Frozen `PendingAction` and approval service | No execution before approval | In-memory state; narrow OPA decision policy; no approval UI |
| Idempotent approval | Completed action returns its existing result | State-based tests | No distributed idempotency key or transaction |
| Observability | Structured in-memory interaction trace | Trace evaluation suite | No persistent/exported telemetry or dashboards |
| Evaluation | Unit, integration, end-to-end, and evaluation specs | Behavior, state, and trace assertions | No CI quality gate or automated semantic judge |

## Getting started

### Prerequisites

- A current Node.js LTS release
- npm
- A Gemini API key

### Install and configure

```bash
npm install
```

Create a local `.env` file or export the environment variable in your shell:

```dotenv
GEMINI_API_KEY=your_api_key
```

The project reads `GEMINI_API_KEY` from the environment and fails clearly when
Gemini-dependent providers are initialized without it. Do not commit the key.

### Run the deterministic REST application

```bash
npm run start:dev
```

The REST application exposes deterministic device, telemetry, and event
services plus `POST /ai/device-assistant`. The assistant endpoint validates the
request and returns an answer with the same interaction ID used by its in-memory
execution trace. The assistant endpoint remains public. Google OIDC and a
protected stateless cookie provide local session authentication for approve/reject;
richer authorization policy, rate limiting, and durable tracing remain production gaps.

### API documentation

Run `npm run start:dev`, then open Swagger UI at
<http://localhost:3000/docs> (default port). It documents the current AI HTTP
application boundaries, including `POST /ai/device-assistant` and pending-action
review/approval/rejection. The OpenAPI document is available at
<http://localhost:3000/docs-json>.

### Review and decide on a proposed action

Review GET remains public; approve/reject require an authenticated local session.
The decision examples below assume `cookies.txt` contains the session cookie from
a completed login; see the [authentication guide](docs/google-oidc-authentication.md)
for setup and browser-based decisions. Start the local PDP with
`npm run authz:pdp:start` before new pending decisions. Use the action ID reported
by the assistant:

```bash
curl http://localhost:3000/ai/pending-actions/pending-action-001
curl -b cookies.txt -X POST http://localhost:3000/ai/pending-actions/pending-action-001/approve
# Or reject instead of approving:
curl -b cookies.txt -X POST http://localhost:3000/ai/pending-actions/pending-action-001/reject
```

Decisions accept no replacement arguments. Approval executes the frozen proposal
without another Gemini call and returns the completed action and work-order
result. Repeated approval of a completed action returns the same result without
another side effect. Unauthenticated decisions return 401; authenticated decisions
with unknown IDs return 404, and invalid state transitions return 409. Requests
containing decision properties return 400. Timestamps are ISO strings, and
`result` is present only after completion.

Google OIDC authentication establishes actor identity; pending actions record
`approvedBy`/`rejectedBy` and decision timestamps. New pending decisions enforce
the OPA policy; explicit denial returns 403 and PDP failure returns sanitized 503. `POST /ai/device-assistant` and `GET /ai/pending-actions/:id` remain
public, including actor records exposed by review. Actions, IDs, and
duplicate-approval idempotency are process-local, not durable across restarts or
shared across instances. The workflow is not production-secure.

### Local Docker Compose runtime

Docker Engine / Docker Desktop with Compose v2 is an additional runtime option.
The existing `npm run start:dev` and `npm run authz:pdp:start` workflows remain
available. Compose runs the compiled application, not watch mode.

Use the existing ignored `.env` (copy `.env.example` if needed), or export the
same environment variables in your shell. Set Gemini/OIDC credentials and a
session secret as described in the authentication guide; no secrets are built
into images. GEMINI_API_KEY is required by existing application startup, and
Compose reports it missing before starting services. Keep the Google registered redirect URI and
`GOOGLE_OIDC_REDIRECT_URI` at `http://localhost:3000/auth/google/callback` for this
local topology: the browser reaches the host address, not `app` or `opa` DNS.

```bash
docker compose config --quiet
docker compose up --build -d --wait
curl --fail http://localhost:3000/devices
# Rego tests use the same official OPA image and read-only policy mount:
docker compose run --rm --no-deps opa test /policy -v
# Stop both services; in-memory proposals/work orders are lost on app restart:
docker compose down
```

`app` is exposed only on host loopback port 3000; `opa` has no published host
port. Compose DNS resolves `opa` inside the network, so the app's explicit
`OPA_URL=http://opa:8181` overrides the local `.env` loopback value. `localhost`
inside a container refers to that container. The existing authorization path,
fail-closed 503 behavior, and duplicate-approval semantics are unchanged.

The application image defaults to production and runs as the non-root `node`
user. This localhost HTTP Compose topology explicitly uses `NODE_ENV=development`
so the existing cookie and OIDC policies permit local HTTP. An HTTPS production
deployment must use production mode and an externally registered HTTPS callback.
Development mode here does not install dev dependencies or run Nest watch mode.

OPA readiness probes the running named Data API decision and expects the
existing default denial for empty input. Compose waits for OPA health before
starting the app; app health uses the public `/devices` endpoint. These are real
checks rather than a sleep, and do not guarantee ongoing dependency availability.
Restart `opa` after editing policies. See the
[container topology and network verification](docs/architecture.md#local-container-topology)
for a real app-client-to-PDP decision check.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile the NestJS application |
| `npm run start:dev` | Start the application in watch mode |
| `npm run lint` | Run Oxlint on src/ and test/ |
| `npm run format` | Rewrite src/ and test/ TypeScript formatting with Prettier |
| `npm test` | Run all Vitest specs matched by the main config |
| `npm run test:cov` | Run tests with coverage |
| `npm run mcp:test` | Build and run the MCP stdio protocol integration spec |
| `npm run ai:http:test` | Run the Device Assistant HTTP boundary integration spec |
| `npm run authz:policy:test` | Run Rego unit tests with the separately installed official OPA CLI |
| `npm run authz:pdp:start` | Start the standalone local OPA PDP on 127.0.0.1:8181; NestJS is not connected |
| `npm run auth:http:test` | Verify local session, logout, and authentication guards |
| `npm run ai:approval:http:test` | Verify pending-action HTTP decisions with real services |
| `npm run api:openapi:test` | Verify the published OpenAPI contract and Swagger UI mount |
| `npm run ai:test` | Run the Device Assistant end-to-end invocation |
| `npm run ai:evaluate` | Run the baseline Device Assistant evaluations |
| `npm run rag:retrieve` | Inspect standalone RAG retrieval |
| `npm run rag:evaluate` | Run grounded RAG-answer evaluations |
| `npm run ai:evaluate:integrated` | Evaluate tool-only, RAG-only, and combined flows |
| `npm run ai:evaluate:actions` | Evaluate action proposal and approval behavior |
| `npm run ai:evaluate:traces` | Evaluate structured interaction traces |

For the OPA Data API examples and deterministic local PDP verification, see
[the architecture guide](docs/architecture.md#local-pdp-runtime-phase-2a).
Pending decisions now enforce OPA results; run the PDP when testing authenticated
approve/reject. Completed duplicate approval remains an idempotent readback.

Gemini-backed commands make live API calls, so outputs and latency may vary and
API usage may incur cost.

## Repository structure

```text
.
|-- knowledge-base/
|   `-- motor-bearing-maintenance.md
|-- src/
|   |-- ai/
|   |   |-- actions/          # Pending actions and deterministic approval
|   |   |-- gemini/           # SDK boundary and normalized interaction types
|   |   |-- http/             # Validated assistant HTTP adapter and failure mapping
|   |   |-- mcp/              # MCP client lifecycle, discovery, Gemini adaptation
|   |   |-- observability/    # Structured AI interaction traces
|   |   |-- rag/              # Chunking, embeddings, vector search, RAG answer flow
|   |   |-- tools/            # Tool schemas, executors, and dispatcher
|   |   |-- device-assistant.prompt.ts
|   |   `-- device-assistant.service.ts
|   |-- auth/                 # Google OIDC, local sessions, and decision guards
|   |-- device-events/        # Event model, mock data, service, REST adapter
|   |-- devices/              # Device model, mock data, service, REST adapter
|   |-- maintenance-work-orders/ # Deterministic side-effect service
|   |-- mcp/               # Read-only MCP stdio protocol adapter
|   `-- telemetry/            # Telemetry model, mock data, service, REST adapter
|-- test/
|   |-- e2e/                  # Full application-context invocation
|   |-- evals/                # Behavioral, integrated, action, RAG, trace cases
|   `-- integration/          # Retrieval/component integration checks
|-- docs/
|   |-- architecture.md
|   `-- google-oidc-authentication.md
`-- package.json
```

## Important design decisions

- Domain data is intentionally separated into identity (`Device`), measurements
  (`Telemetry`), and occurrences (`DeviceEvent`) to avoid duplicated operational
  state.
- Device READ tools use MCP stdio to reach deterministic NestJS services;
  retrieval and action-proposal capabilities retain their existing in-process
  boundaries.
- The MCP server is the source of READ names, descriptions, and input schemas;
  the host's required-tool policy keeps discovery separate from authorization,
  and a small provider-specific adapter converts selected contracts for Gemini.
- Gemini SDK details are isolated behind a small provider-specific boundary;
  there is no premature provider-neutral abstraction.
- RAG supplies relatively static internal knowledge, while tools supply current
  structured application data.
- Model-requested side effects become proposals. Approval and execution are a
  separate deterministic flow.
- Observability captures execution facts; evaluation decides whether behavior
  meets expectations.

The full rationale and trade-offs are documented in
[docs/architecture.md](docs/architecture.md).

## Production gaps

| Area | Current implementation | Production need |
| --- | --- | --- |
| Persistence | Mock data, in-memory vector index, actions, work orders, and traces | Durable stores, migrations, backup, and recovery |
| Security | Google OIDC and protected stateless local sessions; assistant and pending-action review public; new decisions require authentication and OPA allow | Richer authorization policy, tenant isolation, secrets management, session revocation, stronger deployment/security controls |
| Approval | Authenticated approve/reject with OPA enforcement for pending decisions; verified actor and decision timestamp recorded; frozen execution payload | Richer authorization/policy checks, durable audit history, expiry, distributed workflow state, separation of duties as needed |
| Reliability | Bounded loop and explicit errors | Timeouts, retry policy, circuit breaking, quotas, graceful degradation |
| Transactions | In-process idempotent duplicate approval | Transactional state transition and distributed idempotency |
| Observability | Correlated HTTP responses, structured in-memory traces, and NestJS logs | Persistent trace export, redaction policy, metrics, alerting |
| RAG | One local synthetic document and in-memory embeddings | Ingestion lifecycle, access control, freshness, persistent vector store |
| Evaluation | Local deterministic and manual/semi-manual suites | Curated regression dataset, CI gates, cost/latency targets, review process |
| Operations | Local execution | Deployment, health checks, SLOs, runbooks, capacity and cost controls |

## GenAI engineering coverage

This project covers the application-engineering core of a controlled GenAI
system: prompt policy, function calling, bounded orchestration, RAG, multi-source
context, grounded synthesis, human approval for side effects, evaluation, and
execution tracing.

Intentionally out of scope are autonomous long-running agents, multi-agent
systems, persistent conversation memory, broader third-party MCP ecosystems,
external vector databases, reranking,
hybrid search, multimodal input, fine-tuning, LLM-as-a-judge, production
identity/session hardening and authorization policy, and distributed production
operations.

The omissions are deliberate: the repository focuses on clear control boundaries
before adding infrastructure or broader agent autonomy.

Google OIDC login, cookie sessions, and approval actor setup: [authentication guide](docs/google-oidc-authentication.md).
