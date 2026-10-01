import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { DevicesService } from '../devices/devices.service.js';

const getDeviceInputSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(1)
    .describe('The unique ID of the connected device.'),
});

const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  firmwareVersion: z.string().optional(),
});

const getDeviceOutputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    device: deviceSchema,
  }),
  z.object({
    found: z.literal(false),
    deviceId: z.string(),
    error: z.object({
      code: z.literal('DEVICE_NOT_FOUND'),
      message: z.string(),
    }),
  }),
]);

type GetDeviceResult = z.infer<typeof getDeviceOutputSchema>;

@Injectable()
export class McpServerService {
  constructor(private readonly devicesService: DevicesService) {}

  createServer(): McpServer {
    const server = new McpServer({
      name: 'iot-operations-assistant',
      version: '0.0.1',
    });

    this.registerTools(server);

    return server;
  }

  private registerTools(server: McpServer): void {
    server.registerTool(
      'get_device',
      {
        title: 'Get device',
        description:
          'Gets identity and descriptive information for one connected device by ID.',
        inputSchema: getDeviceInputSchema,
        outputSchema: getDeviceOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ deviceId }) => {
        const device = this.devicesService.findById(deviceId);
        const result: GetDeviceResult = device
          ? { found: true, device }
          : {
              found: false,
              deviceId,
              error: {
                code: 'DEVICE_NOT_FOUND',
                message: `Device "${deviceId}" was not found.`,
              },
            };

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  }
}
