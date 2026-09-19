import { Module } from '@nestjs/common';

import { DevicesModule } from '../devices/devices.module.js';
import { MaintenanceWorkOrdersService } from './maintenance-work-orders.service.js';

@Module({
  imports: [DevicesModule],
  providers: [MaintenanceWorkOrdersService],
  exports: [MaintenanceWorkOrdersService],
})
export class MaintenanceWorkOrdersModule {}
