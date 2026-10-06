import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';

import { DeviceAssistantService } from '../device-assistant.service.js';
import { AskDeviceAssistantRequestDto } from './ask-device-assistant-request.dto.js';
import { DeviceAssistantExceptionFilter } from './device-assistant-exception.filter.js';

@Controller('ai/device-assistant')
@UseFilters(DeviceAssistantExceptionFilter)
export class DeviceAssistantController {
  constructor(private readonly deviceAssistant: DeviceAssistantService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  ask(@Body() request: AskDeviceAssistantRequestDto) {
    return this.deviceAssistant.askDeviceAssistant(request.message);
  }
}
