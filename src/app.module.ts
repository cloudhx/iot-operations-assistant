import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { DevicesModule } from './devices/devices.module.js';
import { DeviceEventsModule } from './device-events/device-events.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { AiModule } from './ai/ai.module.js';

@Module({
  imports: [DevicesModule, DeviceEventsModule, TelemetryModule, AiModule],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
