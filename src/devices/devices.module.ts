import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service.js';
import { DevicesController } from './devices.controller.js';

@Module({
  providers: [DevicesService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}
