import { Injectable } from '@nestjs/common';

import { DevicesService } from '../devices/devices.service.js';
import {
  CreateMaintenanceWorkOrderInput,
  MaintenanceWorkOrder,
} from './domain/maintenance-work-order.model.js';

@Injectable()
export class MaintenanceWorkOrdersService {
  private readonly workOrders: MaintenanceWorkOrder[] = [];
  private nextId = 1;

  constructor(private readonly devicesService: DevicesService) {}

  validateCreateInput(
    input: CreateMaintenanceWorkOrderInput,
  ): CreateMaintenanceWorkOrderInput {
    const deviceId = this.requireNonEmpty(input.deviceId, 'deviceId');
    const reason = this.requireNonEmpty(input.reason, 'reason');
    const component = input.component?.trim();

    if (!this.devicesService.findById(deviceId)) {
      throw new Error(`Device \"${deviceId}\" was not found.`);
    }

    return {
      deviceId,
      reason,
      ...(component ? { component } : {}),
    };
  }

  create(input: CreateMaintenanceWorkOrderInput): MaintenanceWorkOrder {
    const validated = this.validateCreateInput(input);
    const workOrder: MaintenanceWorkOrder = {
      id: `maintenance-work-order-${String(this.nextId).padStart(3, '0')}`,
      ...validated,
      status: 'OPEN',
      createdAt: new Date(),
    };

    this.nextId += 1;
    this.workOrders.push(workOrder);

    return workOrder;
  }

  findAll(): MaintenanceWorkOrder[] {
    return [...this.workOrders];
  }

  findById(id: string): MaintenanceWorkOrder | undefined {
    return this.workOrders.find((workOrder) => workOrder.id === id);
  }

  count(): number {
    return this.workOrders.length;
  }

  private requireNonEmpty(value: string, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(
        `Maintenance work order requires a non-empty \"${field}\"`,
      );
    }

    return value.trim();
  }
}
