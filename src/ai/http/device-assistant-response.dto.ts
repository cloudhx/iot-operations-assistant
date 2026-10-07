import { ApiProperty } from '@nestjs/swagger';

export class DeviceAssistantResponseDto {
  @ApiProperty({
    type: String,
    description: 'Unique interaction ID shared with the execution trace.',
    example: 'ai-123e4567-e89b-42d3-a456-426614174000',
  })
  interactionId!: string;

  @ApiProperty({
    type: String,
    description: 'The assistant answer grounded in the available evidence.',
    example: 'The latest event reports a motor-bearing maintenance warning.',
  })
  answer!: string;
}
