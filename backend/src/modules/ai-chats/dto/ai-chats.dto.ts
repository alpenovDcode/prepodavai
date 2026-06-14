import { IsString, IsOptional } from 'class-validator';

export class CreateChatDto {
  @IsString()
  @IsOptional()
  title?: string;
}

export class SendMessageDto {
  @IsString()
  content: string;

  @IsOptional()
  attachments?: string[];
}
