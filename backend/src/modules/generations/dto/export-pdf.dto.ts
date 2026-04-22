import { IsString } from 'class-validator';

export class ExportPdfDto {
  @IsString()
  html: string;
}
