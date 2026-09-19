export interface Device {
  id: string;
  name: string;
  type: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
}
