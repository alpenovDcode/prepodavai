import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsDateString,
  MaxLength,
  MinLength,
  Min,
  Max,
} from 'class-validator';

export class CreatePopupDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  ctaText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  ctaUrl?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(120)
  delaySeconds?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  @Min(-100)
  @Max(100)
  priority?: number;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;
}

// Отдельный класс (а не extends CreatePopupDto), потому что в PATCH body опционален.
export class UpdatePopupDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  body?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  ctaText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  ctaUrl?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(120)
  delaySeconds?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  @Min(-100)
  @Max(100)
  priority?: number;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;
}
