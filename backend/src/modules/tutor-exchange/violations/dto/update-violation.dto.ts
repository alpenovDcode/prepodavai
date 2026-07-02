import { IsEnum } from 'class-validator';

export enum ViolationStatus {
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export class UpdateViolationDto {
  @IsEnum(ViolationStatus)
  status!: ViolationStatus;
}
