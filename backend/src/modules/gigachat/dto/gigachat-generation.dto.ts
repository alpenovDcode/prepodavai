import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export type GigachatMode =
  | 'chat'
  | 'image'
  | 'embeddings'
  | 'audio_speech'
  | 'audio_transcription'
  | 'audio_translation';

export class GigachatGenerationDto {
  @IsIn(['chat', 'image', 'embeddings', 'audio_speech', 'audio_transcription', 'audio_translation'])
  mode: GigachatMode;

  @IsOptional()
  @IsString()
  model?: string;

  @ValidateIf((dto) => dto.mode === 'chat')
  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @ValidateIf((dto) => dto.mode === 'chat')
  @IsString()
  @IsNotEmpty()
  userPrompt?: string;

  @ValidateIf((dto) => dto.mode === 'chat')
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ValidateIf((dto) => dto.mode === 'chat')
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(64)
  @Max(4096)
  maxTokens?: number;

  @ValidateIf((dto) => dto.mode === 'chat')
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ValidateIf((dto) => dto.mode === 'image')
  @IsString()
  @IsNotEmpty()
  prompt?: string;

  @ValidateIf((dto) => dto.mode === 'image')
  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @ValidateIf((dto) => dto.mode === 'image')
  @IsOptional()
  @IsString()
  size?: string;

  @ValidateIf((dto) => dto.mode === 'image')
  @IsOptional()
  @IsString()
  quality?: string;

  @ValidateIf((dto) => dto.mode === 'embeddings' || dto.mode === 'audio_speech')
  @IsString()
  @IsNotEmpty()
  inputText?: string;

  @ValidateIf((dto) => dto.mode === 'audio_speech')
  @IsOptional()
  @IsString()
  voice?: string;

  @ValidateIf((dto) => dto.mode === 'audio_speech')
  @IsOptional()
  @IsString()
  audioFormat?: string;

  @ValidateIf((dto) => dto.mode === 'audio_speech')
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(2)
  audioSpeed?: number;

  @ValidateIf((dto) => dto.mode === 'audio_transcription' || dto.mode === 'audio_translation')
  @IsString()
  @IsNotEmpty()
  audioHash?: string;

  @ValidateIf((dto) => dto.mode === 'audio_transcription')
  @IsOptional()
  @IsString()
  language?: string;

  @ValidateIf((dto) => dto.mode === 'audio_translation')
  @IsOptional()
  @IsString()
  targetLanguage?: string;
}
