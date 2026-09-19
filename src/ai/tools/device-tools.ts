import { GeminiFunctionTool } from '../gemini/gemini.types.js';

export const DEVICE_TOOL_NAMES = {
  GET_DEVICE: 'get_device',
  GET_LATEST_TELEMETRY: 'get_latest_device_telemetry',
  GET_RECENT_EVENTS: 'get_recent_device_events',
} as const;

export type DeviceToolName =
  (typeof DEVICE_TOOL_NAMES)[keyof typeof DEVICE_TOOL_NAMES];

export const DEVICE_TOOLS: GeminiFunctionTool[] = [
  {
    type: 'function',
    name: DEVICE_TOOL_NAMES.GET_DEVICE,
    description:
      'Gets the identity and descriptive information for one connected device. Use this when you need to identify a device or understand what kind of device it is.',
    parameters: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'The unique ID of the connected device.',
        },
      },
      required: ['deviceId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY,
    description:
      'Gets the latest telemetry snapshot for a connected device, containing the most recent raw measurement for each metric reported by that device.',
    parameters: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'The unique ID of the connected device.',
        },
      },
      required: ['deviceId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: DEVICE_TOOL_NAMES.GET_RECENT_EVENTS,
    description:
      'Gets recent operational events reported for a connected device, ordered from newest to oldest. Use this when investigating what recently happened to a device.',
    parameters: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'The unique ID of the connected device.',
        },
        limit: {
          type: 'integer',
          description: 'Optional maximum number of recent events to return.',
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['deviceId'],
      additionalProperties: false,
    },
  },
];
