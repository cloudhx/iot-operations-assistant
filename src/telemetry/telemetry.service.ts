import { Injectable } from '@nestjs/common';
import { Telemetry } from './domain/telemetry.model.js';
import { telemetry } from './mock-data/telemetry.mock-data.js';

const newestFirst = (first: Telemetry, second: Telemetry): number => {
  const timestampDifference =
    second.timestamp.getTime() - first.timestamp.getTime();

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  const metricDifference = first.metric.localeCompare(second.metric);

  if (metricDifference !== 0) {
    return metricDifference;
  }

  return first.id.localeCompare(second.id);
};

@Injectable()
export class TelemetryService {
  findByDeviceId(deviceId: string): Telemetry[] {
    return telemetry
      .filter((record) => record.deviceId === deviceId)
      .sort(newestFirst);
  }

  findByDeviceIdAndMetric(deviceId: string, metric: string): Telemetry[] {
    return telemetry
      .filter(
        (record) => record.deviceId === deviceId && record.metric === metric,
      )
      .sort(newestFirst);
  }

  findLatestByDeviceId(deviceId: string): Telemetry[] {
    const records = this.findByDeviceId(deviceId);
    const latestByMetric = new Map<string, Telemetry>();

    for (const record of records) {
      if (!latestByMetric.has(record.metric)) {
        latestByMetric.set(record.metric, record);
      }
    }

    return [...latestByMetric.values()].sort(newestFirst);
  }

  findLatestMetric(deviceId: string, metric: string): Telemetry | undefined {
    return this.findByDeviceIdAndMetric(deviceId, metric)[0];
  }
}
