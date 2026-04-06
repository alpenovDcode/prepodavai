import { IsOptional, IsString, Matches, Length } from 'class-validator';

export class CreateReferralCodeDto {
  @IsOptional()
  @IsString()
  @Length(4, 16)
  @Matches(/^[A-Za-z0-9_]+$/, { message: 'Код должен содержать только латиницу, цифры и _' })
  customCode?: string;
}
