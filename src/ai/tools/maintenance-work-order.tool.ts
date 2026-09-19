import type { GeminiFunctionTool } from '../gemini/gemini.types.js';

export const CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME =
  'create_maintenance_work_order';

export const CREATE_MAINTENANCE_WORK_ORDER_TOOL: GeminiFunctionTool = {
  type: 'function',
  name: CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME,
  description:
    'Proposes a maintenance work order for a connected device. This does not execute the action: it creates a frozen pending action that requires explicit human approval. Use only when the user explicitly asks to create or schedule a maintenance work order.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      deviceId: {
        type: 'string',
        description: 'The unique ID of the connected device.',
      },
      component: {
        type: 'string',
        description: 'Optional device component that requires maintenance.',
      },
      reason: {
        type: 'string',
        description:
          'The evidence-based reason for the maintenance work order.',
      },
    },
    required: ['deviceId', 'reason'],
  },
};
