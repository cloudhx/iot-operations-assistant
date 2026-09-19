import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { DeviceEventsService } from './device-events.service.js';

@Controller('devices/:deviceId/events')
export class DeviceEventsController {
  constructor(private readonly deviceEventsService: DeviceEventsService) {}

  @Get()
  findByDeviceId(@Param('deviceId') deviceId: string) {
    return this.deviceEventsService.findByDeviceId(deviceId);
  }

  @Get('recent')
  findRecentByDeviceId(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
  ) {
    if (limit === undefined) {
      return this.deviceEventsService.findRecentByDeviceId(deviceId);
    }

    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
      throw new BadRequestException(
        'The "limit" query parameter must be a non-negative integer',
      );
    }

    return this.deviceEventsService.findRecentByDeviceId(deviceId, parsedLimit);
  }
}
