import { Module } from '@nestjs/common';

import { DeviceEventsModule } from '../device-events/device-events.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { McpServerService } from './mcp-server.service.js';

@Module({
  imports: [DevicesModule, TelemetryModule, DeviceEventsModule],
  providers: [McpServerService],
})
export class McpModule {}
