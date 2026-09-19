import { Module } from '@nestjs/common';
import { DevicesModule } from './devices/devices.module.js';
import { DeviceEventsModule } from './device-events/device-events.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { AiModule } from './ai/ai.module.js';

@Module({
  imports: [DevicesModule, DeviceEventsModule, TelemetryModule, AiModule],
})
export class AppModule {}
