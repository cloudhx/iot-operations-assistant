import { Module } from '@nestjs/common';
import { DeviceEventsService } from './device-events.service.js';
import { DeviceEventsController } from './device-events.controller.js';

@Module({
  providers: [DeviceEventsService],
  controllers: [DeviceEventsController],
  exports: [DeviceEventsService],
})
export class DeviceEventsModule {}
