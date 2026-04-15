import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class ChangeAdminPasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(12, { message: 'Новый пароль должен быть не короче 12 символов' })
  @MaxLength(128)
  newPassword: string;
}
