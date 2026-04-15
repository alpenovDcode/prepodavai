import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';

export class SendPhoneCodeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[\d\s()\-]{7,20}$/, { message: 'Некорректный формат номера телефона' })
  phone: string;
}

export class VerifyPhoneDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[\d\s()\-]{7,20}$/, { message: 'Некорректный формат номера телефона' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 6, { message: 'Код должен содержать 4–6 символов' })
  @Matches(/^\d+$/, { message: 'Код должен состоять только из цифр' })
  code: string;
}
