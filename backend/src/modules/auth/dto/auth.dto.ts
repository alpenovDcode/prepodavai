import { IsString, IsNotEmpty } from 'class-validator';

export class ValidateInitDataDto {
  @IsString()
  @IsNotEmpty()
  initData: string;
}

export class LoginWithApiKeyDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  apiKey: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  pass: string;
}

export class StudentLoginDto {
  @IsString()
  @IsNotEmpty()
  accessCode: string;
}

export class SendPhoneCodeDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class LoginWithPhoneDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
