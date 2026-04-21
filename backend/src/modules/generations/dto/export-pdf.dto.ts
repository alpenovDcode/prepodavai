import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class ExportPdfDto {
  @IsString()
  html: string;

  @IsOptional()
  @IsBoolean()
  isWysiwyg?: boolean;
}
