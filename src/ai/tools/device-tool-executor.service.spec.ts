import type { CallToolResult } from '@modelcontextprotocol/client';

import type { GeminiFunctionCall } from '../gemini/gemini.types.js';
import { McpDeviceClientService } from '../mcp/mcp-device-client.service.js';
import { DeviceToolExecutorService } from './device-tool-executor.service.js';
import { DEVICE_TOOL_NAMES } from './device-tools.js';

const successfulToolCases: Array<{
  call: GeminiFunctionCall;
  structuredContent: Record<string, unknown>;
}> = [
  {
    call: {
      id: 'call-device',
      name: DEVICE_TOOL_NAMES.GET_DEVICE,
      arguments: { deviceId: 'vibration-sensor-001' },
    },
    structuredContent: {
      found: true,
      device: { id: 'vibration-sensor-001' },
    },
  },
  {
    call: {
      id: 'call-telemetry',
      name: DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY,
      arguments: { deviceId: 'vibration-sensor-001' },
    },
    structuredContent: {
      found: true,
      deviceId: 'vibration-sensor-001',
      telemetry: [],
    },
  },
  {
    call: {
      id: 'call-events',
      name: DEVICE_TOOL_NAMES.GET_RECENT_EVENTS,
      arguments: { deviceId: 'vibration-sensor-001', limit: 2 },
    },
    structuredContent: {
      found: true,
      deviceId: 'vibration-sensor-001',
      events: [],
    },
  },
];

describe('DeviceToolExecutorService', () => {
  let mcpClient: McpDeviceClientService;
  let executor: DeviceToolExecutorService;

  beforeEach(() => {
    mcpClient = new McpDeviceClientService();
    executor = new DeviceToolExecutorService(mcpClient);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await mcpClient.onModuleDestroy();
  });

  it.each(successfulToolCases)(
    'translates $call.name between Gemini and MCP',
    async ({ call, structuredContent }) => {
      const callTool = vi.spyOn(mcpClient, 'callTool').mockResolvedValue({
        content: [],
        structuredContent,
      });

      await expect(executor.execute(call)).resolves.toEqual({
        callId: call.id,
        name: call.name,
        result: structuredContent,
      });
      expect(callTool).toHaveBeenCalledWith(call.name, call.arguments);
    },
  );

  it('preserves device-not-found as a successful business result', async () => {
    const call: GeminiFunctionCall = {
      id: 'call-not-found',
      name: DEVICE_TOOL_NAMES.GET_DEVICE,
      arguments: { deviceId: 'unknown-device' },
    };
    const notFoundResult = {
      found: false,
      deviceId: 'unknown-device',
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: 'Device "unknown-device" was not found.',
      },
    };

    vi.spyOn(mcpClient, 'callTool').mockResolvedValue({
      content: [],
      structuredContent: notFoundResult,
    });

    await expect(executor.execute(call)).resolves.toEqual({
      callId: call.id,
      name: call.name,
      result: notFoundResult,
    });
  });

  it('treats an MCP error result as execution failure', async () => {
    const call: GeminiFunctionCall = {
      id: 'call-invalid',
      name: DEVICE_TOOL_NAMES.GET_RECENT_EVENTS,
      arguments: { deviceId: 'asset-tracker-001', limit: 0 },
    };
    const mcpError: CallToolResult = {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Input validation error: limit must be at least 1',
        },
      ],
    };

    vi.spyOn(mcpClient, 'callTool').mockResolvedValue(mcpError);

    await expect(executor.execute(call)).rejects.toThrow(
      'MCP tool "get_recent_device_events" failed: Input validation error: limit must be at least 1',
    );
  });

  it('rejects successful MCP results without object structured content', async () => {
    const call: GeminiFunctionCall = {
      id: 'call-no-structured-content',
      name: DEVICE_TOOL_NAMES.GET_DEVICE,
      arguments: { deviceId: 'vibration-sensor-001' },
    };

    vi.spyOn(mcpClient, 'callTool').mockResolvedValue({ content: [] });

    await expect(executor.execute(call)).rejects.toThrow(
      'MCP tool "get_device" returned invalid structured content',
    );
  });

  it('rejects unsupported tools before invoking MCP', async () => {
    const callTool = vi.spyOn(mcpClient, 'callTool');

    await expect(
      executor.execute({
        id: 'call-unsupported',
        name: 'unsupported_device_tool',
        arguments: {},
      }),
    ).rejects.toThrow('Unknown AI tool "unsupported_device_tool"');
    expect(callTool).not.toHaveBeenCalled();
  });
});
