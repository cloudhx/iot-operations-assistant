import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { TelemetryService } from './telemetry.service.js';

@Controller('devices/:deviceId/telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get()
  findByDeviceId(@Param('deviceId') deviceId: string) {
    return this.telemetryService.findByDeviceId(deviceId);
  }

  @Get('latest')
  findLatestByDeviceId(@Param('deviceId') deviceId: string) {
    return this.telemetryService.findLatestByDeviceId(deviceId);
  }

  @Get('metrics/:metric')
  findByDeviceIdAndMetric(
    @Param('deviceId') deviceId: string,
    @Param('metric') metric: string,
  ) {
    return this.telemetryService.findByDeviceIdAndMetric(deviceId, metric);
  }

  @Get('metrics/:metric/latest')
  findLatestMetric(
    @Param('deviceId') deviceId: string,
    @Param('metric') metric: string,
  ) {
    const telemetry = this.telemetryService.findLatestMetric(deviceId, metric);

    if (!telemetry) {
      throw new NotFoundException(
        `No telemetry found for device "${deviceId}" and metric "${metric}"`,
      );
    }

    return telemetry;
  }
}
