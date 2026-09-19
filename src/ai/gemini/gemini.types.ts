export interface GeminiFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: 'string' | 'integer';
        description: string;
        minimum?: number;
        maximum?: number;
      }
    >;
    required: string[];
    additionalProperties: false;
  };
}

export interface GeminiFunctionCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface GeminiFunctionResult {
  callId: string;
  name: string;
  result: unknown;
}

export interface GeminiTurn {
  id: string;
  outputText: string;
  functionCalls: GeminiFunctionCall[];
}
