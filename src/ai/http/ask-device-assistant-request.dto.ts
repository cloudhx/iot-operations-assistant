import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AskDeviceAssistantRequestDto {
  @ApiProperty({
    type: String,
    description:
      'A non-blank question or instruction for the device assistant.',
    pattern: '\\S',
    example: 'What is going on with vibration-sensor-001?',
  })
  @IsString()
  @Matches(/\S/u, { message: 'message must not be blank' })
  message!: string;
}
