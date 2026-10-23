import {
  IsObject,
  IsOptional,
  IsArray,
  IsString,
  IsNotEmpty,
  IsIn,
  IsUrl,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PRESENTATION_LAYOUTS = [
  'title',
  'bullets',
  'two-column',
  'quote',
  'summary',
  'content',
  'image-text',
] as const;

const PRESENTATION_STYLES = ['modern', 'academic', 'creative', 'corporate'] as const;
const PRESENTATION_COLORS = ['indigo', 'emerald', 'violet', 'blue', 'slate'] as const;

/**
 * Строгая входная схема одного слайда. Она намеренно не принимает произвольные
 * поля: глобальный ValidationPipe с forbidNonWhitelisted отклонит неизвестные
 * свойства до того, как они попадут в HTML-шаблон.
 */
export class PresentationSlideDto {
  @IsString()
  @IsIn(PRESENTATION_LAYOUTS)
  layout: (typeof PRESENTATION_LAYOUTS)[number];

  @IsString()
  @MaxLength(500)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  subtitle?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  eyebrow?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  @IsOptional()
  items?: string[];

  @IsString()
  @MaxLength(500)
  @IsOptional()
  leftTitle?: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  leftText?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  rightTitle?: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  rightText?: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  text?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  author?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(5000, { each: true })
  @IsOptional()
  paragraphs?: string[];

  @IsString()
  @MaxLength(500)
  @IsOptional()
  meta?: string;

  // Только публичный HTTPS URL. При PDF-рендере любые внешние запросы всё
  // равно блокируются; эта проверка дополнительно исключает file:, localhost-
  // строки и нестандартные схемы из сохранённых данных.
  @ValidateIf((_object, value) => value !== undefined && value !== '')
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  imageUrl?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  imageAlt?: string;
}

export class PresentationDataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  topic: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  audience: string;

  @IsString()
  @IsIn(PRESENTATION_STYLES)
  style: (typeof PRESENTATION_STYLES)[number];

  @IsString()
  @IsIn(PRESENTATION_COLORS)
  color: (typeof PRESENTATION_COLORS)[number];

  @IsArray()
  @ArrayMinSize(5, { message: 'Презентация должна содержать минимум 5 слайдов' })
  @ArrayMaxSize(24, { message: 'Презентация не может содержать больше 24 слайдов' })
  @ValidateNested({ each: true })
  @Type(() => PresentationSlideDto)
  slides: PresentationSlideDto[];
}

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
  // Пустая строка допустима — это сброс названия на авто-заголовок.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  // Пустая строка — убрать из папки (вернуть в «Без папки»).
  @IsString()
  @IsOptional()
  @MaxLength(100)
  folder?: string;

  @IsObject()
  @IsOptional()
  outputData?: Record<string, unknown>;

  // Для презентаций: структурированные данные слайдов. Backend пере-рендерит
  // HTML и сбросит pdfUrl/pptxUrl (форсируем пересборку файлов при скачивании).
  @IsObject()
  @ValidateNested()
  @Type(() => PresentationDataDto)
  @IsOptional()
  presentationData?: PresentationDataDto;

  // Свободно редактируемая canvas-версия презентации. Полная строгая проверка
  // выполняется Zod-схемой PresentationCanvasSchema в GenerationsService.
  @IsObject()
  @IsOptional()
  canvasData?: Record<string, unknown>;
}

/**
 * DTO для редактирования готового изображения по текстовой инструкции.
 */
export class EditImageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  instruction: string;
}

/**
 * DTO для привязки к уроку.
 */
export class LinkToLessonDto {
  @IsString()
  @IsNotEmpty()
  lessonId: string;
}
