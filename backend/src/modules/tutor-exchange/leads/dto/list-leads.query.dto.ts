import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeadFormat, LeadType } from './create-lead.dto';

export class ListLeadsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsOptional()
  @IsEnum(LeadFormat)
  format?: LeadFormat;

  @IsOptional()
  @IsEnum(LeadType)
  type?: LeadType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
