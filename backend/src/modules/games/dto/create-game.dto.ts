import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

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
}
