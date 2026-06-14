import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum GameType {
  MILLIONAIRE = 'millionaire',
  FLASHCARDS = 'flashcards',
  CROSSWORD = 'crossword',
  MEMORY = 'memory',
  TRUE_FALSE = 'truefalse',
}

export class CreateGameDto {
  @IsNotEmpty()
  @IsString()
  topic: string;

  @IsNotEmpty()
  @IsEnum(GameType)
  type: GameType;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(40)
  count?: number;
}
