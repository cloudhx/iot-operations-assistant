export const AI_TOOL_CATEGORIES = {
  READ: 'READ',
  RETRIEVAL: 'RETRIEVAL',
  ACTION_PROPOSAL: 'ACTION_PROPOSAL',
} as const;

export type AiToolCategory =
  (typeof AI_TOOL_CATEGORIES)[keyof typeof AI_TOOL_CATEGORIES];

export const AI_TOOL_CALL_STATUSES = {
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type AiToolCallStatus =
  (typeof AI_TOOL_CALL_STATUSES)[keyof typeof AI_TOOL_CALL_STATUSES];

export const AI_INTERACTION_OUTCOMES = {
  ANSWERED: 'ANSWERED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  FAILED: 'FAILED',
} as const;

export type AiInteractionOutcome =
  (typeof AI_INTERACTION_OUTCOMES)[keyof typeof AI_INTERACTION_OUTCOMES];

export type AiFailureStage =
  'MODEL_CALL' | 'TOOL_EXECUTION' | 'ORCHESTRATION' | 'FINAL_RESPONSE';

export interface AiRetrievedChunkTrace {
  id: string;
  source: string;
  section?: string;
  similarity: number;
}

export interface AiRetrievalTrace {
  query: string;
  resultCount: number;
  chunks: AiRetrievedChunkTrace[];
}

export interface AiActionProposalTrace {
  pendingActionId: string;
  pendingStatus: 'PENDING_APPROVAL';
}

export interface AiToolCallTrace {
  callId: string;
  name: string;
  category: AiToolCategory;
  arguments: Record<string, unknown>;
  latencyMs: number;
  status: AiToolCallStatus;
  retrieval?: AiRetrievalTrace;
  actionProposal?: AiActionProposalTrace;
  error?: {
    message: string;
  };
}

export interface AiInteractionRound {
  round: number;
  modelLatencyMs: number;
  toolCalls: AiToolCallTrace[];
}

export interface AiInteractionTrace {
  interactionId: string;
  input: string;
  startedAt: Date;
  completedAt?: Date;
  totalLatencyMs?: number;
  rounds: AiInteractionRound[];
  modelCallCount: number;
  toolCallCount: number;
  retrievalCallCount: number;
  actionProposalCount: number;
  pendingActionIds: string[];
  outcome?: AiInteractionOutcome;
  failure?: {
    stage: AiFailureStage;
    message: string;
  };
}
