import { Injectable } from '@nestjs/common';
import { DeviceEvent } from './domain/device-event.model.js';
import { deviceEvents } from './mock-data/device-event.mock-data.js';

const newestFirst = (first: DeviceEvent, second: DeviceEvent): number => {
  const timestampDifference =
    second.timestamp.getTime() - first.timestamp.getTime();

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return first.id.localeCompare(second.id);
};

@Injectable()
export class DeviceEventsService {
  findByDeviceId(deviceId: string): DeviceEvent[] {
    return deviceEvents
      .filter((event) => event.deviceId === deviceId)
      .sort(newestFirst);
  }

  findRecentByDeviceId(deviceId: string, limit?: number): DeviceEvent[] {
    const events = this.findByDeviceId(deviceId);

    if (limit === undefined) {
      return events;
    }

    const normalizedLimit = Math.max(0, Math.floor(limit));

    return events.slice(0, normalizedLimit);
  }
}
