import { Injectable, Logger } from '@nestjs/common';

import { DeviceEventsService } from '../../device-events/device-events.service.js';
import { DevicesService } from '../../devices/devices.service.js';
import { TelemetryService } from '../../telemetry/telemetry.service.js';
import {
  GeminiFunctionCall,
  GeminiFunctionResult,
} from '../gemini/gemini.types.js';
import { DEVICE_TOOL_NAMES } from './device-tools.js';

@Injectable()
export class DeviceToolExecutorService {
  private readonly logger = new Logger(DeviceToolExecutorService.name);

  constructor(
    private readonly devicesService: DevicesService,
    private readonly telemetryService: TelemetryService,
    private readonly deviceEventsService: DeviceEventsService,
  ) {}

  async execute(call: GeminiFunctionCall): Promise<GeminiFunctionResult> {
    this.logger.debug(`Executing AI tool "${call.name}"`);

    try {
      let result: unknown;

      switch (call.name) {
        case DEVICE_TOOL_NAMES.GET_DEVICE:
          result = this.getDevice(call);
          break;

        case DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY:
          result = this.getLatestTelemetry(call);
          break;

        case DEVICE_TOOL_NAMES.GET_RECENT_EVENTS:
          result = this.getRecentEvents(call);
          break;

        default:
          throw new Error(`Unknown AI tool "${call.name}"`);
      }

      return {
        callId: call.id,
        name: call.name,
        result,
      };
    } catch (error) {
      this.logger.error(
        `AI tool "${call.name}" failed`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  private getDevice(call: GeminiFunctionCall): unknown {
    const deviceId = this.requireDeviceId(call);
    const device = this.devicesService.findById(deviceId);

    if (!device) {
      return this.deviceNotFoundResult(deviceId);
    }

    return {
      found: true,
      device,
    };
  }

  private getLatestTelemetry(call: GeminiFunctionCall): unknown {
    const deviceId = this.requireDeviceId(call);
    const device = this.devicesService.findById(deviceId);

    if (!device) {
      return this.deviceNotFoundResult(deviceId);
    }

    const telemetry = this.telemetryService.findLatestByDeviceId(deviceId);

    return {
      found: true,
      deviceId,
      telemetry,
    };
  }

  private getRecentEvents(call: GeminiFunctionCall): unknown {
    const deviceId = this.requireDeviceId(call);
    const limit = this.readOptionalLimit(call);
    const device = this.devicesService.findById(deviceId);

    if (!device) {
      return this.deviceNotFoundResult(deviceId);
    }

    const events = this.deviceEventsService.findRecentByDeviceId(
      deviceId,
      limit,
    );

    return {
      found: true,
      deviceId,
      events,
    };
  }

  private deviceNotFoundResult(deviceId: string) {
    return {
      found: false,
      deviceId,
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: `Device "${deviceId}" was not found.`,
      },
    };
  }

  private requireDeviceId(call: GeminiFunctionCall): string {
    const deviceId = call.arguments.deviceId;

    if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new Error(
        `Tool "${call.name}" requires a non-empty string argument "deviceId"`,
      );
    }

    return deviceId;
  }

  private readOptionalLimit(call: GeminiFunctionCall): number | undefined {
    const limit = call.arguments.limit;

    if (limit === undefined) {
      return undefined;
    }

    if (
      typeof limit !== 'number' ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 20
    ) {
      throw new Error(
        `Tool "${call.name}" argument "limit" must be an integer between 1 and 20`,
      );
    }

    return limit;
  }
}
