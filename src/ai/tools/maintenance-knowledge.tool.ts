import type { GeminiFunctionTool } from '../gemini/gemini.types.js';

export const SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME =
  'search_maintenance_knowledge';

export const SEARCH_MAINTENANCE_KNOWLEDGE_TOOL: GeminiFunctionTool = {
  type: 'function',
  name: SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME,
  description:
    'Search the internal maintenance knowledge base for documented ' +
    'guidance about maintenance, inspection procedures, telemetry ' +
    'interpretation, escalation, or operational procedures. Use this ' +
    'when the user asks what the maintenance guidance says or needs ' +
    'documented procedural knowledge. Do not use it merely to retrieve ' +
    'current device identity, telemetry, or events.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: {
        type: 'string',
        description:
          'A concise description of the maintenance guidance or ' +
          'operational procedure to retrieve.',
      },
    },
    required: ['query'],
  },
};
