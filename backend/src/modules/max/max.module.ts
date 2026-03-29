import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MaxService } from './max.service';
import { MaxController } from './max.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  providers: [MaxService],
  controllers: [MaxController],
  exports: [MaxService],
})
export class MaxModule {}
