import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReplicateService } from './replicate.service';

@Module({
  imports: [ConfigModule],
  providers: [ReplicateService],
  exports: [ReplicateService],
})
export class ReplicateModule {}
