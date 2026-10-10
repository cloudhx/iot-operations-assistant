import { Controller, Get, Header } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }

  // HTTP is served after Nest initialization; readiness does not probe
  // dependencies used only by specific application capabilities.
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  ready() {
    return { status: 'ok' };
  }
}
