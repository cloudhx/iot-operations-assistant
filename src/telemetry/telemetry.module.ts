import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service.js';
import { TelemetryController } from './telemetry.controller.js';

@Module({
  providers: [TelemetryService],
  controllers: [TelemetryController],
  exports: [TelemetryService],
})
export class TelemetryModule {}
