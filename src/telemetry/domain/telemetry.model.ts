export interface Telemetry {
  id: string;
  deviceId: string;
  metric: string;
  value: number;
  unit?: string;
  timestamp: Date;
}
