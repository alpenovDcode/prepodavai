import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    console.log('✅ Prisma подключен к базе данных');
    // Debug: Log available models
    const models = Object.keys(this).filter(key => !key.startsWith('_') && !key.startsWith('$'));
    console.log('Available Prisma models:', models);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
