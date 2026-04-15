import {
  IsObject,
  IsOptional,
  IsArray,
  IsString,
  IsNotEmpty,
  ArrayMaxSize,
  IsIn,
} from 'class-validator';

const ALLOWED_GENERATION_TYPES = [
  'worksheet',
  'quiz',
  'vocabulary',
  'lesson-plan',
  'content-adaptation',
  'message',
  'feedback',
  'image_generation',
  'photosession',
  'presentation',
  'video-analysis',
  'transcription',
  'exam-variant',
  'lesson_preparation',
  'unpacking',
  'sales_advisor',
  'assistant',
] as const;

/**
 * Тело любого generation-запроса — произвольный объект с ограничением по размеру.
 * Размер тела ограничен на уровне express middleware (10 MB), здесь гарантируем
 * что входные данные — валидный объект, а не примитив или массив.
 */
export class GenerationBodyDto {
  [key: string]: unknown;
}

/**
 * DTO для bundle-генерации (несколько типов за раз).
 */
export class GenerationBundleDto {
  @IsArray()
  @ArrayMaxSize(10, { message: 'Нельзя запустить более 10 генераций одновременно' })
  @IsString({ each: true })
  @IsIn(ALLOWED_GENERATION_TYPES, {
    each: true,
    message: 'Недопустимый тип генерации',
  })
  types: string[];

  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;
}

/**
 * DTO для обновления генерации (patch).
 */
export class UpdateGenerationDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @IsObject()
  @IsOptional()
  outputData?: Record<string, unknown>;
}

/**
 * DTO для привязки к уроку.
 */
export class LinkToLessonDto {
  @IsString()
  @IsNotEmpty()
  lessonId: string;
}
