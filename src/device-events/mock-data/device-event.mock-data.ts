import { DeviceEvent } from '../domain/device-event.model.js';

const referenceTime = Date.now();

const minutesAgo = (minutes: number): Date =>
  new Date(referenceTime - minutes * 60_000);

export const deviceEvents: DeviceEvent[] = [
  {
    id: 'evt-env-001',
    deviceId: 'env-sensor-001',
    type: 'battery.low',
    severity: 'warning',
    timestamp: minutesAgo(18),
    metadata: {
      batteryLevel: 12,
    },
  },
  {
    id: 'evt-water-001',
    deviceId: 'water-sensor-001',
    type: 'measurement.threshold_exceeded',
    severity: 'critical',
    timestamp: minutesAgo(8),
    metadata: {
      metric: 'ph',
      value: 9.1,
      maximum: 8.5,
    },
  },
  {
    id: 'evt-vibration-001',
    deviceId: 'vibration-sensor-001',
    type: 'maintenance.required',
    severity: 'warning',
    timestamp: minutesAgo(23),
    metadata: {
      component: 'motor-bearing',
    },
  },
  {
    id: 'evt-tracker-001',
    deviceId: 'asset-tracker-001',
    type: 'device.online',
    severity: 'info',
    timestamp: minutesAgo(240),
  },
  {
    id: 'evt-tracker-002',
    deviceId: 'asset-tracker-001',
    type: 'connection.lost',
    severity: 'critical',
    timestamp: minutesAgo(11),
    metadata: {
      lastSignalStrength: -112,
      unit: 'dBm',
    },
  },
  {
    id: 'evt-temperature-001',
    deviceId: 'temperature-sensor-001',
    type: 'firmware.updated',
    severity: 'info',
    timestamp: minutesAgo(1440),
    metadata: {
      fromVersion: '2.0.4',
      toVersion: '2.0.5',
    },
  },
  {
    id: 'evt-weather-001',
    deviceId: 'weather-station-001',
    type: 'device.online',
    severity: 'info',
    timestamp: minutesAgo(90),
  },
  {
    id: 'evt-energy-001',
    deviceId: 'energy-meter-001',
    type: 'firmware.updated',
    severity: 'info',
    timestamp: minutesAgo(10080),
    metadata: {
      fromVersion: '1.6.3',
      toVersion: '1.6.4',
    },
  },
];
