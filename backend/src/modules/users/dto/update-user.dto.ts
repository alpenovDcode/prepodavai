import { IsString, IsOptional, IsBoolean, MaxLength, IsEmail } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  firstName?: string;

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
