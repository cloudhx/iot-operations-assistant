import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { DeviceEventsService } from '../device-events/device-events.service.js';
import { DevicesService } from '../devices/devices.service.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';

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

const telemetrySchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  metric: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  timestamp: z.iso.datetime(),
});

const deviceEventSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  type: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  timestamp: z.iso.datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const deviceNotFoundSchema = z.object({
  found: z.literal(false),
  deviceId: z.string(),
  error: z.object({
    code: z.literal('DEVICE_NOT_FOUND'),
    message: z.string(),
  }),
});

const getDeviceOutputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    device: deviceSchema,
  }),
  deviceNotFoundSchema,
]);

const getLatestDeviceTelemetryOutputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    deviceId: z.string(),
    telemetry: z.array(telemetrySchema),
  }),
  deviceNotFoundSchema,
]);

const getRecentDeviceEventsInputSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(1)
    .describe('The unique ID of the connected device.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Optional maximum number of recent events to return.'),
});

const getRecentDeviceEventsOutputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    deviceId: z.string(),
    events: z.array(deviceEventSchema),
  }),
  deviceNotFoundSchema,
]);

type GetDeviceResult = z.infer<typeof getDeviceOutputSchema>;
type GetLatestDeviceTelemetryResult = z.infer<
  typeof getLatestDeviceTelemetryOutputSchema
>;
type GetRecentDeviceEventsResult = z.infer<
  typeof getRecentDeviceEventsOutputSchema
>;
type DeviceNotFoundResult = z.infer<typeof deviceNotFoundSchema>;

const deviceNotFound = (deviceId: string): DeviceNotFoundResult => ({
  found: false,
  deviceId,
  error: {
    code: 'DEVICE_NOT_FOUND',
    message: `Device "${deviceId}" was not found.`,
  },
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

@Injectable()
export class McpServerService {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly telemetryService: TelemetryService,
    private readonly deviceEventsService: DeviceEventsService,
  ) {}

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
        annotations: readOnlyAnnotations,
      },
      async ({ deviceId }) => {
        const device = this.devicesService.findById(deviceId);
        const result: GetDeviceResult = device
          ? { found: true, device }
          : deviceNotFound(deviceId);

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );

    server.registerTool(
      'get_latest_device_telemetry',
      {
        title: 'Get latest device telemetry',
        description:
          'Gets the latest raw telemetry snapshot for a connected device, with the most recent measurement for each metric.',
        inputSchema: getDeviceInputSchema,
        outputSchema: getLatestDeviceTelemetryOutputSchema,
        annotations: readOnlyAnnotations,
      },
      async ({ deviceId }) => {
        const device = this.devicesService.findById(deviceId);
        const result: GetLatestDeviceTelemetryResult = device
          ? {
              found: true,
              deviceId,
              telemetry: this.telemetryService
                .findLatestByDeviceId(deviceId)
                .map((record) => ({
                  ...record,
                  timestamp: record.timestamp.toISOString(),
                })),
            }
          : deviceNotFound(deviceId);

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );

    server.registerTool(
      'get_recent_device_events',
      {
        title: 'Get recent device events',
        description:
          'Gets recent operational events for a connected device, ordered from newest to oldest.',
        inputSchema: getRecentDeviceEventsInputSchema,
        outputSchema: getRecentDeviceEventsOutputSchema,
        annotations: readOnlyAnnotations,
      },
      async ({ deviceId, limit }) => {
        const device = this.devicesService.findById(deviceId);
        const result: GetRecentDeviceEventsResult = device
          ? {
              found: true,
              deviceId,
              events: this.deviceEventsService
                .findRecentByDeviceId(deviceId, limit)
                .map((event) => ({
                  ...event,
                  timestamp: event.timestamp.toISOString(),
                })),
            }
          : deviceNotFound(deviceId);

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  }
}
