import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateViolationDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;
}
