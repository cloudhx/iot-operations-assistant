import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { DeviceAssistantService } from '../device-assistant.service.js';
import { AskDeviceAssistantRequestDto } from './ask-device-assistant-request.dto.js';
import { DeviceAssistantExceptionFilter } from './device-assistant-exception.filter.js';
import { DeviceAssistantResponseDto } from './device-assistant-response.dto.js';
import { DeviceAssistantErrorResponseDto } from './device-assistant-error-response.dto.js';

@ApiTags('Device assistant')
@Controller('ai/device-assistant')
@UseFilters(DeviceAssistantExceptionFilter)
export class DeviceAssistantController {
  constructor(private readonly deviceAssistant: DeviceAssistantService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the device assistant about IoT operations' })
  @ApiBody({ type: AskDeviceAssistantRequestDto })
  @ApiOkResponse({
    description: 'Assistant answer with its interaction correlation ID.',
    type: DeviceAssistantResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'The message must be a non-blank string; unexpected body properties are rejected.',
  })
  @ApiInternalServerErrorResponse({
    description:
      'Sanitized assistant failure with its interaction correlation ID.',
    type: DeviceAssistantErrorResponseDto,
  })
  async ask(
    @Body() request: AskDeviceAssistantRequestDto,
  ): Promise<DeviceAssistantResponseDto> {
    const result = await this.deviceAssistant.askDeviceAssistant(
      request.message,
    );

    return { interactionId: result.interactionId, answer: result.answer };
  }
}
