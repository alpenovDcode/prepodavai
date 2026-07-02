import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum DialogAction {
  SCHEDULE_TRIAL = 'schedule_trial',
  TRIAL_SUCCESS = 'trial_success',
  TRIAL_FAIL = 'trial_fail',
  PAYMENT_SENT = 'payment_sent',
  CONFIRM_PAYMENT = 'confirm_payment',
  DISPUTE = 'dispute',
  CANCEL = 'cancel',
}

export class DialogActionDto {
  @IsEnum(DialogAction)
  action!: DialogAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  trialLessonLink?: string;
}
