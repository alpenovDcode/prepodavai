import { Module } from '@nestjs/common';
import { SmscService } from './smsc.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule],
    providers: [SmscService],
    exports: [SmscService],
})
export class SmscModule { }
