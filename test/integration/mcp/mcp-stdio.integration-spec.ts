import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const expectValidSerializedTimestamp = (value: unknown): void => {
  expect(value).toEqual(expect.any(String));

  const timestamp = value as string;
  expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  expect(new Date(timestamp).toISOString()).toBe(timestamp);
};

describe('MCP stdio server', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client(
      {
        name: 'iot-operations-assistant-integration-test',
        version: '1.0.0',
      },
      {
        versionNegotiation: {
          mode: {
            pin: '2026-07-28',
          },
        },
      },
    );

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/mcp/mcp-main.js'],
      cwd: process.cwd(),
    });

    await client.connect(transport);
  }, 20_000);

  afterAll(async () => {
    await client.close();
  });

  it('connects using the modern MCP protocol', () => {
    expect(client.getProtocolEra()).toBe('modern');
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
  });

  it('discovers the read-only device tools', async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((tool) => tool.name).sort();

    expect(toolNames).toEqual([
      'get_device',
      'get_latest_device_telemetry',
      'get_recent_device_events',
    ]);

    for (const tool of result.tools) {
      expect(tool.inputSchema).toMatchObject({
        type: 'object',
        required: ['deviceId'],
      });
    }
  });

  it('returns an existing device through the MCP protocol', async () => {
    const result = await client.callTool({
      name: 'get_device',
      arguments: { deviceId: 'vibration-sensor-001' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: true,
      device: {
        id: 'vibration-sensor-001',
        name: 'Production Motor Monitor',
        type: 'industrial-vibration-sensor',
        manufacturer: 'IndustrialSense',
        model: 'VibraCheck V3',
        firmwareVersion: '3.1.2',
      },
    });
  });

  it('returns a valid not-found result for an unknown device', async () => {
    const result = await client.callTool({
      name: 'get_device',
      arguments: { deviceId: 'unknown-device' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: false,
      deviceId: 'unknown-device',
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: 'Device "unknown-device" was not found.',
      },
    });
  });

  it('rejects invalid input through the MCP schema', async () => {
    const result = await client.callTool({
      name: 'get_device',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Input validation error'),
        }),
      ]),
    );
  });

  it('returns the latest telemetry snapshot for an existing device', async () => {
    const result = await client.callTool({
      name: 'get_latest_device_telemetry',
      arguments: { deviceId: 'vibration-sensor-001' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: true,
      deviceId: 'vibration-sensor-001',
      telemetry: [
        {
          id: 'tel-vibration-004',
          deviceId: 'vibration-sensor-001',
          metric: 'temperature',
          value: 92.4,
          unit: '°C',
          timestamp: expect.any(String),
        },
        {
          id: 'tel-vibration-002',
          deviceId: 'vibration-sensor-001',
          metric: 'vibration',
          value: 8.9,
          unit: 'mm/s',
          timestamp: expect.any(String),
        },
      ],
    });

    const structuredContent = result.structuredContent;

    if (
      !structuredContent ||
      typeof structuredContent !== 'object' ||
      !('telemetry' in structuredContent) ||
      !Array.isArray(structuredContent.telemetry)
    ) {
      throw new Error('Expected telemetry structured content.');
    }

    for (const record of structuredContent.telemetry) {
      if (!record || typeof record !== 'object' || !('timestamp' in record)) {
        throw new Error('Expected telemetry record with timestamp.');
      }

      expectValidSerializedTimestamp(record.timestamp);
    }
  });

  it('returns an empty telemetry snapshot for an existing device without telemetry', async () => {
    const result = await client.callTool({
      name: 'get_latest_device_telemetry',
      arguments: { deviceId: 'gateway-001' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: true,
      deviceId: 'gateway-001',
      telemetry: [],
    });
  });

  it('returns a valid telemetry not-found result for an unknown device', async () => {
    const result = await client.callTool({
      name: 'get_latest_device_telemetry',
      arguments: { deviceId: 'unknown-device' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: false,
      deviceId: 'unknown-device',
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: 'Device "unknown-device" was not found.',
      },
    });
  });

  it('rejects invalid telemetry input through the MCP schema', async () => {
    const result = await client.callTool({
      name: 'get_latest_device_telemetry',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Input validation error'),
        }),
      ]),
    );
  });

  it('returns recent events for an existing device', async () => {
    const result = await client.callTool({
      name: 'get_recent_device_events',
      arguments: { deviceId: 'asset-tracker-001' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: true,
      deviceId: 'asset-tracker-001',
      events: [
        {
          id: 'evt-tracker-002',
          deviceId: 'asset-tracker-001',
          type: 'connection.lost',
          severity: 'critical',
          timestamp: expect.any(String),
          metadata: {
            lastSignalStrength: -112,
            unit: 'dBm',
          },
        },
        {
          id: 'evt-tracker-001',
          deviceId: 'asset-tracker-001',
          type: 'device.online',
          severity: 'info',
          timestamp: expect.any(String),
        },
      ],
    });

    const structuredContent = result.structuredContent;

    if (
      !structuredContent ||
      typeof structuredContent !== 'object' ||
      !('events' in structuredContent) ||
      !Array.isArray(structuredContent.events)
    ) {
      throw new Error('Expected event structured content.');
    }

    for (const event of structuredContent.events) {
      if (!event || typeof event !== 'object' || !('timestamp' in event)) {
        throw new Error('Expected event record with timestamp.');
      }

      expectValidSerializedTimestamp(event.timestamp);
    }
  });

  it('respects the recent-event limit', async () => {
    const result = await client.callTool({
      name: 'get_recent_device_events',
      arguments: { deviceId: 'asset-tracker-001', limit: 1 },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      found: true,
      deviceId: 'asset-tracker-001',
      events: [{ id: 'evt-tracker-002' }],
    });

    const structuredContent = result.structuredContent;

    if (
      !structuredContent ||
      typeof structuredContent !== 'object' ||
      !('events' in structuredContent) ||
      !Array.isArray(structuredContent.events)
    ) {
      throw new Error('Expected event structured content.');
    }

    expect(structuredContent.events).toHaveLength(1);
  });

  it('returns an empty event list for an existing device without events', async () => {
    const result = await client.callTool({
      name: 'get_recent_device_events',
      arguments: { deviceId: 'gateway-001' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: true,
      deviceId: 'gateway-001',
      events: [],
    });
  });

  it('returns a valid event not-found result for an unknown device', async () => {
    const result = await client.callTool({
      name: 'get_recent_device_events',
      arguments: { deviceId: 'unknown-device' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      found: false,
      deviceId: 'unknown-device',
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: 'Device "unknown-device" was not found.',
      },
    });
  });

  it('rejects an out-of-range event limit through the MCP schema', async () => {
    const result = await client.callTool({
      name: 'get_recent_device_events',
      arguments: { deviceId: 'asset-tracker-001', limit: 0 },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Input validation error'),
        }),
      ]),
    );
  });
});
