# Architecture and Design Decisions

## Purpose

This document explains the control boundaries used by the IoT Operations Assistant. The
application demonstrates a connected-device operations assistant that can reason
over current structured data, retrieve maintenance knowledge, and propose a
maintenance action without receiving authority to execute it.

The governing principle is:

> **Probabilistic reasoning, deterministic execution.**

The project is intentionally production-oriented rather than production-ready.
It models the seams a production system needs, while using in-memory data and a
small synthetic knowledge base so those seams remain easy to inspect.

## System boundaries

```text
Probabilistic plane                          Deterministic control plane

User
 |
 v
DeviceAssistantService <--> Gemini boundary
 |  bounded rounds             |
 |                             | natural-language reasoning
 v                             | capability selection
Tool dispatcher ---------------+
 |          |             |
 | READ     | RETRIEVAL   | ACTION_PROPOSAL
 |          |             |
 v          v             v
Device      RAG           validated, frozen
services    retrieval     PendingAction
                            |
                            | explicit human approval
                            v
                         approval service
                            |
                            | exact stored arguments; no Gemini
                            v
                         MaintenanceWorkOrdersService

AiTraceService spans model calls, tool calls, retrieval, proposals, and outcome.
Evaluation suites assert behavior, resulting state, and trace structure.
```

The boundaries are asymmetric by design:

- The LLM may interpret, select, combine, and propose.
- The application validates, limits, dispatches, records, and controls.
- The human authorizes a sensitive side effect.
- The deterministic domain service performs the approved business operation.

An LLM function call is a request to the application, not execution authority.

## Component responsibilities

| Component | Responsibility | Explicitly does not own |
| --- | --- | --- |
| `DeviceAssistantService` | Application orchestration, bounded model/tool rounds, final outcome | Device business logic, SDK response parsing, approval execution |
| Assistant HTTP adapter | Validate one request, invoke the assistant, and return its correlated result | AI orchestration, trace lookup, or internal error inspection |
| Assistant exception filter | Log correlated diagnostics and map interaction failures to a sanitized HTTP response | Provider/tool recovery or generic error handling |
| `GeminiClientService` | Google GenAI SDK lifecycle and normalized turns/function calls | IoT policy, tool business logic, generic provider abstraction |
| Assistant system instruction | Model behavior, grounding, evidence-source distinctions | Deterministic enforcement or authorization |
| Tool definitions | Static retrieval/action contracts plus MCP-discovered READ contracts | Service implementation details |
| Tool dispatcher | Capability classification, executor routing, timing, normalized failures | Domain logic |
| Device tool executor | Whitelist READ tools and translate Gemini calls/results to/from MCP | Health scoring or diagnosis |
| Assistant MCP client | Modern protocol negotiation, stdio lifecycle, cached `tools/list`, and `callTool` | Tool policy, tracing, or domain logic |
| MCP-to-Gemini adapter | Select required authorized MCP READ tools and convert their schemas into Gemini declarations | Tool execution or dynamic authorization |
| RAG retrieval | Document loading, chunking, embedding, similarity ranking | Final operational conclusions |
| Maintenance action executor | Validate and store a proposed action | Execute the work order |
| Pending-action approval | Apply a human decision and execute an approved frozen payload | Re-run model reasoning |
| Domain/application services | Deterministic data and business operations | LLM orchestration |
| MCP stdio server adapter | Validate and expose read-only device, telemetry, and event services over MCP | Gemini orchestration, side effects, or domain logic |
| `AiTraceService` | Structured facts about execution | Semantic grading of answer quality |
| Evaluation specs | Repeatable behavioral, state, and trace checks | Production monitoring |

## Capability and authority model

| Category | Current tools | Evidence returned | Authority |
| --- | --- | --- | --- |
| `READ` | `get_device`, `get_latest_device_telemetry`, `get_recent_device_events` | Current structured application data | Read only |
| `RETRIEVAL` | `search_maintenance_knowledge` | Ranked chunks from the internal guide | Read only |
| `ACTION_PROPOSAL` | `create_maintenance_work_order` | A pending action ID and status | Proposal only |

Tool categories serve both design and observability. A reviewer can distinguish a
fact lookup from retrieval and from a request that could eventually lead to a
side effect.

## Execution flows

### 0. HTTP application boundary

```text
POST /ai/device-assistant
  -> global DTO validation rejects malformed input before AI execution
  -> controller invokes DeviceAssistantService
  -> service starts the interaction trace and uses that ID as correlation
  -> success returns { interactionId, answer }
  -> internal failure records FAILED, then carries the same ID to the filter
  -> filter logs internal diagnostics and returns a sanitized correlated 500
```

The HTTP layer does not inspect `AiTraceService`; trace storage is observability
state rather than an application error channel. Blank input is also rejected in
the service so non-HTTP callers retain the same defensive boundary.

### 1. Read-only tool flow

```text
User question
  -> DeviceAssistantService starts trace
  -> MCP client lists tools once per connection
  -> host selects required authorized READ tools and adapts their schemas for Gemini
  -> Gemini receives prompt and the stable per-interaction tool set
  -> Gemini requests one or more read tools
  -> dispatcher validates category and routes calls
  -> executor translates the calls to MCP callTool requests
  -> stdio MCP server validates arguments and calls deterministic services
  -> executor translates MCP structuredContent into Gemini function results
  -> structured results return to the same Gemini interaction
  -> Gemini returns a grounded answer
  -> trace completes as ANSWERED
```

Multiple calls from one model turn are executed concurrently. The loop accepts
further tool calls but stops after five rounds. Unknown tools, malformed
arguments, exhausted rounds, tool failures, and empty final responses fail
explicitly.

### 2. Tool plus RAG flow

```text
User asks what is happening and what guidance applies
  -> Gemini selects current-data READ tools
  -> MCP-backed READ tools return device / telemetry / event facts
  -> Gemini selects search_maintenance_knowledge
  -> retrieval initializes the document index once per application lifetime
       Markdown -> semantic sections -> document embeddings -> in-memory store
  -> query embedding -> cosine similarity -> top ranked chunks
  -> retrieved source, section, text, and diagnostic metadata return as evidence
  -> Gemini separates current observations from general maintenance guidance
  -> final synthesis states evidence and limitations without inventing root cause
```

The standalone `RagAnswerService` proves the RAG path independently. The
integrated assistant does not generate one RAG answer and feed it into another
LLM call; it retrieves chunks and lets the main assistant synthesize all evidence
once.

### 3. Human-approved action flow

```text
User asks about a device or requests maintenance
  -> Gemini may gather READ and RETRIEVAL evidence
  -> Gemini may propose maintenance when the evidence supports it
  -> if proposing, Gemini calls create_maintenance_work_order
  -> application validates deviceId, reason, and optional component
  -> PendingActionsService freezes a copied argument payload
  -> assistant reports pendingActionId; trace outcome = APPROVAL_REQUIRED
  -> external human caller reviews GET /ai/pending-actions/:id
  -> human approves or rejects by POST /ai/pending-actions/:id/approve or /reject

Reject:
  -> pending action becomes REJECTED
  -> no work order is created

Approve:
  -> approval service loads the exact stored action
  -> action becomes APPROVED
  -> MaintenanceWorkOrdersService executes stored arguments (no Gemini call)
  -> action becomes COMPLETED and stores the result

Duplicate approval:
  -> completed action returns its existing work order
  -> no duplicate side effect
```

The frozen payload prevents approval drift: the human approves the same arguments
that will be executed. In a production system this boundary would be backed by
durable storage and a transaction.

The HTTP controller invokes the existing services and maps snapshots to transport
DTOs with ISO timestamps and a typed work-order result. Decision requests cannot
replace execution arguments. Application not-found/state-conflict errors are
mapped by a controller-scoped filter to sanitized 404/409 responses; successful
decisions and duplicate approval return 200. Reads and decisions return copies
so callers cannot mutate internal action state or replace stored arguments.

`POST /ai/device-assistant` and `GET /ai/pending-actions/:id` remain public.
POST approve/reject require a protected local session established through Google
OIDC; missing or invalid sessions return 401 without redirecting. `AuthGuard`
establishes a provider-neutral `AuthenticatedPrincipal`, which the controller
passes into the application decision service. Pending actions record
`approvedBy`/`rejectedBy` and the corresponding decision timestamp; duplicate
approval preserves the original actor and timestamp. The application decision
service remains independent of Google/OIDC-specific types.

Authentication establishes actor identity only; no authorization policy is
enforced by the current NestJS runtime. Actor records are currently visible
through the public review endpoint. Pending-action IDs and idempotency remain local to the single-process
prototype and must not be treated as durable references. See the
[authentication guide](google-oidc-authentication.md) for session and login details.

## Authorization policy baseline (Phase 1)

Open Policy Agent (OPA) / Rego is the selected Policy Decision Point (PDP)
technology for application AuthZ. Phase 1 adds only `policy/pending-actions.rego`
and its Rego unit tests: the NestJS runtime does not call OPA, and current
approve/reject behavior remains unchanged. The eventual boundary is a NestJS
Policy Enforcement Point (PEP) calling a local OPA PDP; it is not implemented here.

The decision at `data.authz.pending_actions.allow` accepts this small contract:

```json
{
  "principal": { "id": "user-123" },
  "action": "approve_pending_action",
  "resource": {
    "type": "maintenance_work_order",
    "status": "PENDING_APPROVAL"
  }
}
```

`principal + action + resource` yields a boolean decision. `default allow := false`
means no matching rule denies. Allow requires a nonblank string principal ID,
`approve_pending_action` or `reject_pending_action`, and the resource type/status
shown above. No roles, tenants, provider claims, execution authority, or policy
data are introduced. The policy does not authenticate a principal: a future PEP
must supply verified identity and authoritative resource state, not caller claims.

Install the official OPA 1.x CLI separately and put `opa` on PATH; no binary is
vendored and no npm dependency, cloud account, or paid service is required.
Run `opa test policy/ -v` or `npm run authz:policy:test` from the repository root.
The policy uses Rego v1 syntax. See the official
[OPA installation instructions](https://www.openpolicyagent.org/docs#running-opa)
and [policy testing reference](https://www.openpolicyagent.org/docs/policy-testing).

This contract covers new decisions on pending proposals only. It denies
`COMPLETED` resources; Phase 2B must reconcile PEP placement with the existing
idempotent duplicate-approval response without changing that workflow behavior.

### Local PDP runtime (Phase 2A)

Rego is the policy language; the official OPA executable is the running PDP.
Phase 1 provides policy source and unit tests. Phase 2A runs that same policy
in a standalone local process. NestJS remains disconnected: no PEP or runtime
authorization enforcement is added, and approve/reject behavior is unchanged.

With the official OPA 1.x CLI on PATH, run from the repository root:

```bash
npm run authz:policy:test
npm run authz:pdp:start
# Equivalent server command:
# opa run --server --addr 127.0.0.1:8181 policy/
```

OPA stays in the foreground; stop it with Ctrl+C. The explicit loopback address
keeps this development PDP local on the standard port 8181. Restart it after
changing policy files. No binary is vendored, and no container or npm dependency
is required.

In another terminal, query the native Data API. The API's `input` wrapper carries
the unchanged Phase 1 contract:

```bash
curl --fail --silent --show-error \
  http://127.0.0.1:8181/v1/data/authz/pending_actions/allow \
  -H 'Content-Type: application/json' \
  --data '{"input":{"principal":{"id":"user-123"},"action":"approve_pending_action","resource":{"type":"maintenance_work_order","status":"PENDING_APPROVAL"}}}'
# Expected HTTP 200: {"result":true}

curl --fail --silent --show-error \
  http://127.0.0.1:8181/v1/data/authz/pending_actions/allow \
  -H 'Content-Type: application/json' \
  --data '{"input":{}}'
# Expected HTTP 200: {"result":false}
```

For deterministic integration verification against that running OPA process,
run this standalone command with the project's Node.js runtime. It checks
HTTP status and exact boolean decisions; connection errors, timeouts, missing
results, and unexpected decisions fail the command. No NestJS or Google call
is involved.

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';

const request = {
  principal: { id: 'user-123' },
  action: 'approve_pending_action',
  resource: { type: 'maintenance_work_order', status: 'PENDING_APPROVAL' },
};
const cases = [
  ['approve', request, true],
  ['reject', { ...request, action: 'reject_pending_action' }, true],
  ['unsupported action', { ...request, action: 'execute_maintenance_work_order' }, false],
  ['incomplete input', {}, false],
];
for (const [name, input, expected] of cases) {
  const response = await fetch('http://127.0.0.1:8181/v1/data/authz/pending_actions/allow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, name);
  const decision = await response.json();
  assert.equal(decision.result, expected, name);
  console.log(`${name}: ${JSON.stringify(decision)}`);
}
JS
```

The local verification path is authorization input → OPA Data API →
`data.authz.pending_actions.allow` → true/false. Both allow and deny return
HTTP 200; inspect the boolean result. An absent result is not a denial result
from this named, default-deny policy and must fail verification.
See the official [Data API reference](https://www.openpolicyagent.org/docs/rest-api).
HTTP is used here only to exercise OPA's native interface; it does not select the
application-to-PDP transport. NestJS PEP and transport design are deferred to
Phase 2B.

## Design decisions

### 1. Deterministic core, probabilistic edge

LLM reasoning is placed at the interpretation and orchestration edge. Existing
NestJS services remain the source of data and business operations. This contains
model variability and keeps important invariants testable.

**Trade-off:** the application must define and maintain explicit tool contracts
instead of allowing unrestricted model access.

### 2. Device identity, telemetry, and events are separate

`Device` describes relatively static identity, `Telemetry` records raw
measurements, and `DeviceEvent` records occurrences. Operational state is not
duplicated on the device model.

**Trade-off:** consumers must derive current state from time-sensitive evidence,
but the model avoids contradictory copies of status and `lastSeenAt`.

### 3. Device READ tools cross an explicit MCP boundary

The assistant host translates its three device READ calls to MCP `callTool`
requests, with protocol version `2026-07-28` explicitly pinned. The stdio server
validates each request and invokes the existing services through NestJS
dependency injection. REST controllers remain a separate adapter over those
services. Retrieval and action proposal stay in-process because they have not
been exposed as MCP capabilities.

The same MCP connection discovers READ definitions through `tools/list`. The
server is the source of names, descriptions, and input schemas; the host retains
an explicit required-tool policy and converts only the supported JSON Schema
subset to Gemini's provider-specific function format. Discovery therefore does
not grant new authority, and MCP does not eliminate model-provider adaptation.

**Trade-off:** the protocol boundary is explicit and independently testable, but
the host must build and manage a local child process and translate MCP results
back into its model-facing result type.

### 4. Gemini is isolated behind a provider-specific boundary

`GeminiClientService` owns SDK calls and converts SDK responses into small
application-facing turn and function-call types. The rest of the application
does not parse Gemini interaction steps.

**Trade-off:** the boundary is not provider-neutral. That is intentional: a
generic LLM interface would hide meaningful provider semantics before a second
provider creates a real need.

### 5. The model/tool loop is bounded

The assistant supports multiple calls and rounds but caps execution at five tool
rounds. This is enough to demonstrate agentic behavior without permitting
unbounded autonomous operation.

**Trade-off:** a legitimate complex request may terminate at the limit and must
be retried or redesigned.

### 6. RAG chunks are evidence, not authority

The maintenance guide supplies relevant static knowledge. Retrieval results are
passed as source-labelled evidence, and the prompt requires the model to keep
general guidance separate from current device facts.

**Trade-off:** RAG improves evidence access but does not guarantee correct
retrieval or grounded generation.

### 7. Guardrails combine policy and deterministic boundaries

The system instruction prohibits unsupported states, causes, thresholds, and
recommendations. Schemas, argument validation, round limits, service boundaries,
and approval state transitions provide deterministic controls where possible.

**Trade-off:** prompt rules remain probabilistic; evaluation is still required.

### 8. Side-effecting tools are distinct from read and retrieval tools

The dispatcher categorizes every capability as `READ`, `RETRIEVAL`, or
`ACTION_PROPOSAL`. This makes risk and intent visible in code and traces.

**Trade-off:** every new capability must be classified and given an executor
with the appropriate control path.

### 9. Proposal is not execution authority

`create_maintenance_work_order` creates a pending proposal only. The model cannot
directly create a work order, even when the user asks it to.

**Trade-off:** the workflow takes an additional human step, which is appropriate
for a meaningful operational side effect.

### 10. Approval uses the frozen payload

`PendingActionsService` copies and freezes validated arguments. Approval executes
that stored snapshot rather than current chat text or regenerated model output.

**Trade-off:** a changed request requires a new proposal instead of silently
editing an existing one.

### 11. Approval does not call Gemini again

Once a human has approved the exact proposal, deterministic code invokes
`MaintenanceWorkOrdersService`. The model has no role in reconstructing or
reinterpreting the authorized operation.

**Trade-off:** approval cannot dynamically enrich missing fields; validation must
make the proposal executable before it is presented.

### 12. Duplicate approval is idempotent in process

Approving a completed action returns the stored work order instead of executing
the operation again.

**Trade-off:** this provides process-local protection only. Distributed workers
require durable idempotency keys and transactional state changes.

### 13. Structured traces and logs have different jobs

NestJS logs provide local operational messages. `AiInteractionTrace` records a
queryable domain-specific execution record with rounds, counts, tool categories,
latencies, retrieval metadata, proposal IDs, outcomes, and bounded errors.

**Trade-off:** the in-memory trace store is inspectable but not durable or
integrated with an APM backend.

### 14. Observability and evaluation are separate

Observability records what happened. Evaluation compares behavior against an
expectation. Trace-based evaluation consumes traces, but the trace itself does
not decide whether a natural-language response is correct.

**Trade-off:** semantic answer quality still needs human review or a deliberately
chosen future evaluation method.

### 15. Chain-of-thought is not captured

The project records model-visible actions and application execution facts, not
private reasoning tokens. This reduces sensitive-data exposure and avoids
mistaking generated rationales for reliable audit evidence.

**Trade-off:** debugging focuses on prompts, tool calls, evidence, outputs, and
timing rather than hidden reasoning.

### 16. Agentic behavior is deliberately bounded

The model can select multiple capabilities across multiple rounds, but there is
no persistent agent memory, autonomous planner, background worker, multi-agent
system, or open-ended retry loop.

**Trade-off:** the architecture favors inspectability and control over autonomy.

### 17. HTTP errors preserve correlation without exposing internals

Successful assistant results and failed-interaction errors carry the exact ID
created when the trace starts. The HTTP filter uses that ID for both operational
logging and the public response, while provider, transport, tool, stack, and
filesystem details remain server-side.

**Trade-off:** callers receive a stable high-level failure rather than a detailed
diagnosis; operators must use the interaction ID to correlate logs and traces.

### 18. OpenAPI describes transport contracts

The assistant HTTP contract is documented through Nest Swagger metadata and
published as OpenAPI with Swagger UI. Bootstrap configures this documentation;
global request validation remains registered through `APP_PIPE` in `AppModule`.
`DeviceAssistantResult` stays an application result, independent of HTTP.
Response DTOs provide runtime schema metadata for the success response and the
sanitized failure response, with explicit mapping at the controller boundary.

**Trade-off:** transport DTOs are added where OpenAPI requires runtime schema
metadata; deterministic controllers and application/domain types are not
normalized into response DTOs for symmetry.

## RAG mechanics and evidence boundaries

### Ingestion time

```text
synthetic Markdown guide
  -> split on headings and paragraph boundaries
  -> embed each chunk with Gemini
  -> store { chunk, vector } in memory
```

### Query time

```text
maintenance question
  -> query embedding
  -> cosine similarity against stored vectors
  -> descending rank
  -> top-K chunks with source and section metadata
```

The model does not read the entire document on every request. Embeddings locate
semantically relevant chunks. Similarity is retrieval metadata, not a domain
fact, and embedding vectors are not exposed to Gemini.

Four failure categories remain useful during diagnosis:

1. **Retrieval failure:** the relevant chunk was not selected.
2. **Context failure:** the correct chunk was selected but passed poorly.
3. **Generation failure:** correct evidence was present but the answer ignored or
   embellished it.
4. **Knowledge gap:** the source document does not contain the answer.

## Grounding policy

The assistant is instructed to:

- use device tools for current, device-specific facts;
- use retrieval for internal guidance and procedures;
- combine both only when the request needs both;
- separate observations, documented guidance, and interpretation;
- avoid treating missing telemetry or events as proof of status;
- avoid numeric classification without an applicable baseline or threshold;
- avoid turning general maintenance possibilities into device-specific causes;
- say when available evidence is insufficient.

This preserves useful interpretation when evidence exists—for example a
`maintenance.required` warning, component metadata, and relevant measurements—
without allowing the model to present an unverified bearing failure as fact.

## Observability model

An `AiInteractionTrace` contains:

- a generated interaction ID and the input;
- start, completion, and total latency;
- numbered rounds and per-round model latency;
- model, tool, retrieval, and proposal counts;
- tool call ID, name, category, arguments, latency, and success/failure;
- retrieved chunk IDs, source, section, and similarity;
- pending action IDs;
- outcome: `ANSWERED`, `APPROVAL_REQUIRED`, or `FAILED`;
- failure stage and minimal message when execution fails.

Stack traces remain in restricted operational logging rather than the
application-facing AI trace. This keeps traces useful for execution analysis
without unnecessarily spreading file paths, dependency internals, or sensitive
runtime details.

No chain-of-thought is collected. Tool calls, retrieved evidence, outputs, and
state transitions are the auditable application facts.

## Evaluation strategy

| Layer | What it checks | Examples |
| --- | --- | --- |
| Unit | Deterministic component behavior | pending-action transitions, approval idempotency |
| Integration | Multiple local components | document ingestion, embedding, retrieval ranking |
| End-to-end | Nest application context plus live Gemini | one complete assistant invocation |
| Behavioral evaluation | Capability selection and grounded answers | baseline device cases and missing-data handling |
| RAG evaluation | Retrieval plus document-grounded generation | maintenance questions and insufficient knowledge |
| Integrated evaluation | Tools only, RAG only, and tools plus RAG | multi-source orchestration |
| Action evaluation | Proposal versus execution authority | approval required, rejection, duplicate approval |
| Trace evaluation | Observable execution structure | categories, counts, outcomes, failure metadata |

The suite does not require exactly one valid tool sequence for broad questions.
It checks whether necessary evidence was obtained, irrelevant capabilities were
avoided, state transitions are correct, and the final answer is grounded.
Natural-language outputs may still require manual `PASS` / `PARTIAL` / `FAIL`
review. Evaluation and tracing are complementary, not interchangeable.

## Production gap matrix

| Concern | Current implementation | Why it is acceptable here | Production direction |
| --- | --- | --- | --- |
| Domain data | Deterministic in-memory mock records | Repeatable evaluation scenarios | Database-backed repositories and migrations |
| Work orders | In-memory service | Makes side effects visible without infrastructure | Durable transactional store and external integration |
| Pending actions | In-memory map, process-local IDs, and recorded actors/decision timestamps | Demonstrates lifecycle and frozen payload | Durable workflow state, expiry, audit history |
| Idempotency | Return stored result for completed action | Demonstrates duplicate-approval semantics | Transactional idempotency key across workers |
| Authentication | Google OIDC-backed local sessions protect decision endpoints; assistant and review remain public | Demonstrates verified actor identity at the HTTP boundary | Production identity/session hardening and distributed session/revocation strategy |
| Authorization | Authenticated actor identity only; no decision policy; actor records visible in public review | AuthN and AuthZ remain separate responsibilities | RBAC/policy, tenant/ownership rules, and separation of duties as justified |
| Secrets | Gemini/Google OIDC credentials and session secret in environment variables | Minimal local configuration | Managed secret store, rotation, least privilege |
| Model reliability | Explicit errors and bounded loop | Keeps behavior observable | Timeouts, retry budget, circuit breaker, fallback policy |
| Cost control | Fixed small data and bounded rounds | Keeps API usage bounded during local evaluation | Token budgets, quotas, caching, cost telemetry |
| RAG corpus | One synthetic local Markdown file | Retrieval is manually inspectable | Governed ingestion, ACLs, versioning, freshness checks |
| Vector storage | In-memory cosine search | Makes mechanics explicit | Persistent vector index with lifecycle operations |
| Retrieval quality | Top-K semantic similarity | Sufficient for a single small guide | Benchmarking, filters, hybrid search/reranking if justified |
| Guardrails | Prompt policy plus deterministic controls | Targets observed evaluation failures | Policy versioning, broader adversarial and safety tests |
| Traces | In-memory structured records | Easy local inspection | Export to telemetry backend with retention and redaction |
| Error detail | Minimal trace failures, stack in logs | Reduces trace data exposure | Formal logging classification and secure diagnostics |
| Evaluation | Local live-model and deterministic assertions | Exposes model variability | Versioned datasets, CI gates, latency/cost quality bars |
| API surface | Deterministic REST, public assistant/review, and authenticated decisions | Demonstrates AI and deterministic approval boundaries | Authorization policy, versioning, rate limits, abuse controls |
| Deployment | Local NestJS application | Application-level architecture is the current focus | Containerization, health checks, SLOs, runbooks |

## GenAI landscape coverage

### Covered

- provider-specific SDK isolation;
- system instructions and grounding policy;
- structured function declarations and local execution;
- multi-call, multi-round bounded orchestration;
- semantic retrieval, embeddings, vector similarity, and grounded RAG;
- multi-source context orchestration;
- controlled action proposals and human approval;
- idempotent deterministic execution;
- behavioral, state, and trace-based evaluation;
- AI-aware observability without chain-of-thought capture.

### Deliberately out of scope

- broader third-party MCP ecosystems;
- LangChain, LangGraph, or a generic agent framework;
- autonomous long-running or multi-agent workflows;
- persistent conversation memory;
- multimodal input and output;
- fine-tuning and model training;
- external vector databases, reranking, and hybrid search;
- LLM-as-a-judge;
- production identity, authorization, tenancy, and policy engines;
- production deployment, distributed tracing, and SRE operations.

These are not implied capabilities. They are logical future extensions only when
a concrete requirement justifies their operational and architectural cost.
