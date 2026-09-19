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
- Structured interaction traces and evaluation suites covering behavior,
  application state, and trace structure.

## Architecture at a glance

```text
                              probabilistic reasoning
User question
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
      +--> deterministic device / telemetry / event services

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
2. Gemini requests the device, telemetry, or event tools it needs.
3. The application validates and dispatches each tool call to existing NestJS
   services.
4. Structured results are returned to the same Gemini interaction.
5. Gemini synthesizes a grounded answer within a bounded number of rounds.

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
| Human-in-the-loop action | Frozen `PendingAction` and approval service | No execution before approval | In-memory state; no authenticated approval UI/API |
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

The existing REST controllers expose deterministic device, telemetry, and event
services. The AI capabilities are currently exercised through application-context
tests and evaluation scripts rather than an AI HTTP controller.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile the NestJS application |
| `npm run start:dev` | Start the application in watch mode |
| `npm run lint` | Run Oxlint and Prettier checks |
| `npm test` | Run all Vitest specs matched by the main config |
| `npm run test:cov` | Run tests with coverage |
| `npm run ai:test` | Run the Device Assistant end-to-end invocation |
| `npm run ai:evaluate` | Run the baseline Device Assistant evaluations |
| `npm run rag:retrieve` | Inspect standalone RAG retrieval |
| `npm run rag:evaluate` | Run grounded RAG-answer evaluations |
| `npm run ai:evaluate:integrated` | Evaluate tool-only, RAG-only, and combined flows |
| `npm run ai:evaluate:actions` | Evaluate action proposal and approval behavior |
| `npm run ai:evaluate:traces` | Evaluate structured interaction traces |

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
|   |   |-- observability/    # Structured AI interaction traces
|   |   |-- rag/              # Chunking, embeddings, vector search, RAG answer flow
|   |   |-- tools/            # Tool schemas, executors, and dispatcher
|   |   |-- device-assistant.prompt.ts
|   |   `-- device-assistant.service.ts
|   |-- device-events/        # Event model, mock data, service, REST adapter
|   |-- devices/              # Device model, mock data, service, REST adapter
|   |-- maintenance-work-orders/ # Deterministic side-effect service
|   `-- telemetry/            # Telemetry model, mock data, service, REST adapter
|-- test/
|   |-- e2e/                  # Full application-context invocation
|   |-- evals/                # Behavioral, integrated, action, RAG, trace cases
|   `-- integration/          # Retrieval/component integration checks
|-- docs/
|   `-- architecture.md
`-- package.json
```

## Important design decisions

- Domain data is intentionally separated into identity (`Device`), measurements
  (`Telemetry`), and occurrences (`DeviceEvent`) to avoid duplicated operational
  state.
- AI tools call NestJS services directly rather than making HTTP calls back into
  the same application.
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
| Security | Environment API key; no AI/action API surface | Authentication, authorization, secrets management, tenant isolation |
| Approval | Service-level human decision demonstrated in tests | Authenticated approval interface, audit actor, expiry, policy checks |
| Reliability | Bounded loop and explicit errors | Timeouts, retry policy, circuit breaking, quotas, graceful degradation |
| Transactions | In-process idempotent duplicate approval | Transactional state transition and distributed idempotency |
| Observability | Structured in-memory traces and NestJS logs | Persistent trace export, redaction policy, metrics, alerting, correlation |
| RAG | One local synthetic document and in-memory embeddings | Ingestion lifecycle, access control, freshness, persistent vector store |
| Evaluation | Local deterministic and manual/semi-manual suites | Curated regression dataset, CI gates, cost/latency targets, review process |
| Operations | Local execution | Deployment, health checks, SLOs, runbooks, capacity and cost controls |

## GenAI engineering coverage

This project covers the application-engineering core of a controlled GenAI
system: prompt policy, function calling, bounded orchestration, RAG, multi-source
context, grounded synthesis, human approval for side effects, evaluation, and
execution tracing.

Intentionally out of scope are autonomous long-running agents, multi-agent
systems, persistent conversation memory, MCP, external vector databases,
reranking, hybrid search, multimodal input, fine-tuning, LLM-as-a-judge,
production identity and access control, and distributed production operations.

The omissions are deliberate: the repository focuses on clear control boundaries
before adding infrastructure or broader agent autonomy.
