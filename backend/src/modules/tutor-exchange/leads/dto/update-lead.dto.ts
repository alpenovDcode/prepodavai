import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadFormat } from './create-lead.dto';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  grade?: string;

  @IsOptional()
  @IsEnum(LeadFormat)
  format?: LeadFormat;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(30)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  studentContact?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  price?: number;
}
