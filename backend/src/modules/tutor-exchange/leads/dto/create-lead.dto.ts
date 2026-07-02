import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LeadType {
  FREE = 'FREE',
  COMMISSION = 'COMMISSION',
}

export enum LeadFormat {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export class CreateLeadDto {
  @IsEnum(LeadType)
  type: LeadType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  grade: string;

  @IsEnum(LeadFormat)
  format: LeadFormat;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsString()
  @MinLength(30)
  @MaxLength(4000)
  description: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  studentContact: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50000)
  price?: number;
}
