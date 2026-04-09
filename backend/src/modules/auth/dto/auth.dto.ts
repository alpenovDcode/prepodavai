import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

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

export class RegisterByEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  firstName?: string;
}

export class VerifyEmailCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  // UTM-атрибуция
  @IsString()
  @IsOptional()
  utmSource?: string;

  @IsString()
  @IsOptional()
  utmMedium?: string;

  @IsString()
  @IsOptional()
  utmCampaign?: string;

  @IsString()
  @IsOptional()
  utmContent?: string;

  @IsString()
  @IsOptional()
  utmTerm?: string;

  @IsString()
  @IsOptional()
  utmLandingPage?: string;

  @IsString()
  @IsOptional()
  utmLinkId?: string;
}

export class GenerateLinkTokenDto {
  @IsString()
  @IsNotEmpty()
  platform: string; // 'telegram' | 'max'
}

export class UnlinkPlatformDto {
  @IsString()
  @IsNotEmpty()
  platform: string; // 'telegram' | 'max'
}
