import { IsString, IsNotEmpty } from 'class-validator';

export class ApplyReferralCodeDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
