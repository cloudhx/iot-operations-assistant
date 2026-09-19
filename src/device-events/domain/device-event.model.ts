export type DeviceEventSeverity = 'info' | 'warning' | 'critical';

export interface DeviceEvent {
  id: string;
  deviceId: string;
  type: string;
  severity: DeviceEventSeverity;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
