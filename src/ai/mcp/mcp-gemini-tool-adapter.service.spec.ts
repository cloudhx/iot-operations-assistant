import type { Tool } from '@modelcontextprotocol/client';

import { DEVICE_TOOL_NAMES } from '../tools/device-tools.js';
import { McpDeviceClientService } from './mcp-device-client.service.js';
import { McpGeminiToolAdapterService } from './mcp-gemini-tool-adapter.service.js';

const deviceIdProperty = {
  type: 'string',
  minLength: 1,
  description: 'The unique ID of the connected device.',
};

const discoveredReadTools: Tool[] = [
  {
    name: DEVICE_TOOL_NAMES.GET_DEVICE,
    description: 'Gets one connected device by ID.',
    inputSchema: {
      type: 'object',
      properties: { deviceId: deviceIdProperty },
      required: ['deviceId'],
    },
  },
  {
    name: DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY,
    description: 'Gets the latest telemetry snapshot for a device.',
    inputSchema: {
      type: 'object',
      properties: { deviceId: deviceIdProperty },
      required: ['deviceId'],
    },
  },
  {
    name: DEVICE_TOOL_NAMES.GET_RECENT_EVENTS,
    description: 'Gets recent events for a device.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: deviceIdProperty,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Maximum number of events to return.',
        },
      },
      required: ['deviceId'],
    },
  },
];

describe('McpGeminiToolAdapterService', () => {
  let mcpClient: McpDeviceClientService;
  let adapter: McpGeminiToolAdapterService;

  beforeEach(() => {
    mcpClient = new McpDeviceClientService();
    adapter = new McpGeminiToolAdapterService(mcpClient);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await mcpClient.onModuleDestroy();
  });

  it('adapts the supported MCP READ tools to Gemini declarations', async () => {
    vi.spyOn(mcpClient, 'listTools').mockResolvedValue(discoveredReadTools);

    await expect(adapter.getGeminiDeviceTools()).resolves.toEqual([
      {
        type: 'function',
        name: DEVICE_TOOL_NAMES.GET_DEVICE,
        description: 'Gets one connected device by ID.',
        parameters: {
          type: 'object',
          properties: {
            deviceId: deviceIdProperty,
          },
          required: ['deviceId'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY,
        description: 'Gets the latest telemetry snapshot for a device.',
        parameters: {
          type: 'object',
          properties: {
            deviceId: deviceIdProperty,
          },
          required: ['deviceId'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: DEVICE_TOOL_NAMES.GET_RECENT_EVENTS,
        description: 'Gets recent events for a device.',
        parameters: {
          type: 'object',
          properties: {
            deviceId: deviceIdProperty,
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              description: 'Maximum number of events to return.',
            },
          },
          required: ['deviceId'],
          additionalProperties: false,
        },
      },
    ]);
  });

  it('does not expose tools outside the required device capability set', async () => {
    vi.spyOn(mcpClient, 'listTools').mockResolvedValue([
      ...discoveredReadTools,
      {
        name: 'delete_device',
        description: 'Deletes a device.',
        inputSchema: {
          type: 'object',
          properties: { deviceId: deviceIdProperty },
          required: ['deviceId'],
        },
      },
    ]);

    const tools = await adapter.getGeminiDeviceTools();

    expect(tools.map(({ name }) => name)).toEqual([
      DEVICE_TOOL_NAMES.GET_DEVICE,
      DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY,
      DEVICE_TOOL_NAMES.GET_RECENT_EVENTS,
    ]);
  });

  it('fails if a required device capability is missing', async () => {
    vi.spyOn(mcpClient, 'listTools').mockResolvedValue(
      discoveredReadTools.filter(
        ({ name }) => name !== DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY,
      ),
    );

    await expect(adapter.getGeminiDeviceTools()).rejects.toThrow(
      'MCP server is missing required READ tool "get_latest_device_telemetry"',
    );
  });

  it('fails if a required device tool is advertised more than once', async () => {
    vi.spyOn(mcpClient, 'listTools').mockResolvedValue([
      ...discoveredReadTools,
      discoveredReadTools[0],
    ]);

    await expect(adapter.getGeminiDeviceTools()).rejects.toThrow(
      'MCP server returned duplicate tool "get_device"',
    );
  });

  it('ignores schema metadata that does not change the tool contract', async () => {
    const toolWithMetadata: Tool = {
      ...discoveredReadTools[0],
      inputSchema: {
        ...discoveredReadTools[0].inputSchema,
        title: 'Get device input',
        examples: [{ deviceId: 'sensor-001' }],
        properties: {
          deviceId: {
            ...deviceIdProperty,
            title: 'Device ID',
            examples: ['sensor-001'],
            default: 'sensor-001',
          },
        },
      },
    };

    vi.spyOn(mcpClient, 'listTools').mockResolvedValue([
      toolWithMetadata,
      ...discoveredReadTools.slice(1),
    ]);

    const [tool] = await adapter.getGeminiDeviceTools();

    expect(tool.parameters.properties.deviceId).toEqual(deviceIdProperty);
  });

  it('fails instead of dropping unsupported schema constructs', async () => {
    const unsupportedTool: Tool = {
      ...discoveredReadTools[0],
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: 'The unique ID of the connected device.',
            pattern: '^device-',
          },
        },
        required: ['deviceId'],
      },
    };

    vi.spyOn(mcpClient, 'listTools').mockResolvedValue([
      unsupportedTool,
      ...discoveredReadTools.slice(1),
    ]);

    await expect(adapter.getGeminiDeviceTools()).rejects.toThrow(
      'MCP tool "get_device" property "deviceId" uses unsupported keyword "pattern"',
    );
  });
});
