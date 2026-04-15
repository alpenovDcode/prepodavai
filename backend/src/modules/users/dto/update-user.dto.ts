import { IsString, IsOptional, IsBoolean, MaxLength, IsEmail, Matches, ValidateIf } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  lastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  bio?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  subject?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  grades?: string;

  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  @IsOptional()
  @MaxLength(200)
  email?: string;

  @IsString()
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @Matches(/^[a-f0-9]{64}$/, { message: 'avatar должен быть SHA-256 хешем файла' })
  avatar?: string;

  @IsBoolean()
  @IsOptional()
  notifyNewCourse?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyStudentProgress?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyWeeklyReport?: boolean;
}
