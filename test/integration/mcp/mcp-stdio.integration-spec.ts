import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

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

  it('discovers the get_device tool', async () => {
    const result = await client.listTools();

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      name: 'get_device',
      inputSchema: {
        type: 'object',
        required: ['deviceId'],
      },
    });
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
});
