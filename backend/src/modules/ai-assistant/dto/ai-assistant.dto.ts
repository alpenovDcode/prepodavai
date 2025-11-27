import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
    @IsString()
    role: 'user' | 'assistant' | 'system';

    @IsString()
    content: string;
}

export class SendMessageDto {
    @IsString()
    message: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatMessageDto)
    history?: ChatMessageDto[];
}

export class ChatResponseDto {
    @IsString()
    response: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatMessageDto)
    history: ChatMessageDto[];
}
