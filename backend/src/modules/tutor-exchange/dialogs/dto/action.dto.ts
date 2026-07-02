import { IsEnum } from 'class-validator';

export enum DialogAction {
  CANCEL = 'cancel',
}

export class DialogActionDto {
  @IsEnum(DialogAction)
  action!: DialogAction;
}
