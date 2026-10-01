import { Module } from '@nestjs/common';

import { DevicesModule } from '../devices/devices.module.js';
import { McpServerService } from './mcp-server.service.js';

@Module({
  imports: [DevicesModule],
  providers: [McpServerService],
})
export class McpModule {}
