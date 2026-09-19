import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { DevicesService } from './devices.service.js';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  findAll() {
    return this.devicesService.findAll();
  }

  @Get(':deviceId')
  findById(@Param('deviceId') deviceId: string) {
    const device = this.devicesService.findById(deviceId);

    if (!device) {
      throw new NotFoundException(`Device "${deviceId}" was not found`);
    }

    return device;
  }
}
