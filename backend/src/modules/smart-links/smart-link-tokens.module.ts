import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmartLinkTokensService } from './smart-link-tokens.service';

/**
 * Глобальный mini-модуль с Redis-хранилищем атрибуций UTM. Сделан
 * @Global, чтобы Telegram-бот (где /start <token> читает атрибуцию)
 * мог инжектить сервис без явного импорта — иначе получается циклическая
 * зависимость: SmartLinksModule ← AdminModule ← TelegramModule.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [SmartLinkTokensService],
  exports: [SmartLinkTokensService],
})
export class SmartLinkTokensModule {}
