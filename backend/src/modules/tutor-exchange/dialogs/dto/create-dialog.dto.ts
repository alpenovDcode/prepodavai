import { IsString, MinLength } from 'class-validator';

export class CreateDialogDto {
  @IsString()
  @MinLength(1)
  leadId!: string;
}
