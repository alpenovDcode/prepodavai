import { IsOptional, IsString } from 'class-validator';

export class AnalyzeSalesChatDto {
    @IsOptional()
    @IsString()
    fileUrl?: string;

    @IsOptional()
    @IsString()
    fileHash?: string;
}
