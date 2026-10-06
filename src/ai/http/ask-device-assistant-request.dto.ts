import { IsString, Matches } from 'class-validator';

export class AskDeviceAssistantRequestDto {
  @IsString()
  @Matches(/\S/u, { message: 'message must not be blank' })
  message!: string;
}
