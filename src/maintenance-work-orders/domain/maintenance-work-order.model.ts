export type MaintenanceWorkOrderStatus = 'OPEN';

export interface CreateMaintenanceWorkOrderInput {
  deviceId: string;
  component?: string;
  reason: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  deviceId: string;
  component?: string;
  reason: string;
  status: MaintenanceWorkOrderStatus;
  createdAt: Date;
}
