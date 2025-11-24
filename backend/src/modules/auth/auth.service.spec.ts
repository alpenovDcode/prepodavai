import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let configService: ConfigService;

  // Mocks
  let mockUsersService: any;
  let mockJwtService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockUsersService = {
      getOrCreateByTelegram: jest.fn(),
      findByUsernameAndApiKey: jest.fn(),
      updateLastAccess: jest.fn(),
      findById: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn(() => 'test_token'),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return 'test_bot_token';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateTelegramInitData', () => {
    it('should throw UnauthorizedException if bot token is missing', async () => {
      // Override the mock behavior for this specific test
      mockConfigService.get.mockReturnValue(null);

      await expect(service.validateTelegramInitData('query_id=...')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should validate correct initData', async () => {
      // Ensure mock returns token (it should be fresh from beforeEach, but let's be explicit if needed,
      // though beforeEach handles it. The previous test modified the previous mock instance,
      // but beforeEach creates a NEW mockConfigService object and assigns it to the module).

      // Подготовка данных для валидной подписи
      const botToken = 'test_bot_token';
      const user = JSON.stringify({
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
      });
      const authDate = Math.floor(Date.now() / 1000).toString();

      const params = new URLSearchParams();
      params.append('auth_date', authDate);
      params.append('user', user);
      params.append('query_id', 'AAG...');

      // Сортировка и создание строки для хеширования
      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      params.append('hash', hash);
      const initData = params.toString();

      mockUsersService.getOrCreateByTelegram.mockResolvedValue({
        id: 'user_id',
        telegramId: '123456789',
        username: 'testuser',
      });

      const result = await service.validateTelegramInitData(initData);

      expect(result.success).toBe(true);
      expect(result.token).toBe('test_token');
      expect(mockUsersService.getOrCreateByTelegram).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid signature', async () => {
      const initData = 'auth_date=123&hash=invalid_hash&user={}';
      await expect(service.validateTelegramInitData(initData)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
