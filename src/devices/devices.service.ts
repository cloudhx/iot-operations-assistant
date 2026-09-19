import { Injectable } from '@nestjs/common';
import { Device } from './domain/device.model.js';
import { devices } from './mock-data/devices.mock-data.js';

@Injectable()
export class DevicesService {
  findAll(): Device[] {
    return [...devices];
  }

  findById(id: string): Device | undefined {
    return devices.find((device) => device.id === id);
  }
}
