import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum DisputeResolutionDto {
  DEAL_CONFIRMED = 'DEAL_CONFIRMED',
  RETURNED_TO_FEED = 'RETURNED_TO_FEED',
  CANCELLED = 'CANCELLED',
}

export class ResolveDisputeDto {
  @IsEnum(DisputeResolutionDto)
  resolution!: DisputeResolutionDto;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  note!: string;

  @IsOptional()
  @IsBoolean()
  freezeResponder?: boolean;
}
