import {
  IsObject,
  IsOptional,
  IsArray,
  IsString,
  IsNotEmpty,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

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
 * Строгий whitelist типов не делаем — маршрутизация по типам выполняется
 * дальше в сервисе/стратегиях, а фронтенд использует смешанную нотацию
 * (camelCase + kebab-case). Проверяем только структуру и лимиты.
 */
export class GenerationBundleDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Список типов не должен быть пустым' })
  @ArrayMaxSize(10, { message: 'Нельзя запустить более 10 генераций одновременно' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(64, { each: true })
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
