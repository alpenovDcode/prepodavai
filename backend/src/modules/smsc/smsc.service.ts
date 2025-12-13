import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmscService {
  private readonly logger = new Logger(SmscService.name);
  private readonly apiUrl = 'https://smsc.ru/sys/send.php';

  constructor(private readonly configService: ConfigService) {}

  async sendSms(phone: string, message: string): Promise<boolean> {
    const login = this.configService.get<string>('SMSC_LOGIN');
    const password = this.configService.get<string>('SMSC_PASSWORD');
    const sender = this.configService.get<string>('SMSC_SENDER'); // Optional

    if (!login || !password) {
      this.logger.error('SMSC credentials not configured');
      return false;
    }

    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          login,
          psw: password,
          phones: phone,
          mes: message,
          sender: sender || undefined,
          fmt: 3, // JSON response
          charset: 'utf-8',
        },
      });

      if (response.data && response.data.id) {
        this.logger.log(`SMS sent to ${phone}, id: ${response.data.id}`);
        return true;
      } else {
        this.logger.error(
          `Failed to send SMS to ${phone}: ${JSON.stringify(response.data)}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(`Error sending SMS to ${phone}: ${error.message}`);
      return false;
    }
  }
}
