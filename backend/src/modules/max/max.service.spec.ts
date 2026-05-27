import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MaxService } from './max.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import { TOOL_CONFIGS, getToolConfig } from './tool-configs';

jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCallbackBody(payload: string, userId = '111', messageId = 'msg-1') {
  return {
    update_type: 'message_callback',
    callback: {
      callback_id: 'cb-1',
      payload,
      user: { user_id: userId },
      message: {
        body: { mid: messageId },
        recipient: { user_id: userId },
      },
    },
  };
}

function makeMessageBody(text: string, userId = '111') {
  return {
    update_type: 'message_created',
    message: {
      from: { user_id: userId, username: 'tester' },
      text,
      recipient: { user_id: userId },
    },
  };
}

function makeBotStartedBody(userId = '111', chatId = '111') {
  return {
    update_type: 'bot_started',
    user: { user_id: userId, first_name: 'Test', username: 'tester' },
    chat_id: chatId,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MaxService', () => {
  let service: MaxService;
  let mockPrisma: any;
  let mockHtmlExport: any;

  beforeEach(async () => {
    mockPrisma = {
      appUser: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      linkToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(async (ops: any) =>
        Array.isArray(ops) ? Promise.all(ops) : ops(mockPrisma),
      ),
    };

    mockHtmlExport = {
      normalizeIncomingHtml: jest.fn().mockReturnValue('<p>html</p>'),
      htmlToPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };

    mockedAxios.post = jest.fn().mockResolvedValue({ status: 200, data: { message: { body: { mid: 'msg-99' } } } });
    mockedAxios.put = jest.fn().mockResolvedValue({ status: 200, data: {} });
    mockedAxios.get = jest.fn().mockResolvedValue({ data: Buffer.from('file') });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaxService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              const map: Record<string, string> = {
                MAX_BOT_TOKEN: 'test-token',
                MAX_API_URL: 'https://max.example.com',
                API_URL: 'http://localhost:3001',
                WEBAPP_URL: 'https://prepodavai.ru',
              };
              return map[key] ?? def ?? null;
            }),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HtmlExportService, useValue: mockHtmlExport },
      ],
    }).compile();

    service = module.get<MaxService>(MaxService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── handleWebhook routing ─────────────────────────────────────────────────

  describe('handleWebhook', () => {
    it('routes message_callback to handleCallback', async () => {
      const spy = jest.spyOn(service as any, 'handleCallback').mockResolvedValue(undefined);
      await service.handleWebhook(makeCallbackBody('g:no'));
      expect(spy).toHaveBeenCalled();
    });

    it('routes message_created to handleMessage', async () => {
      const spy = jest.spyOn(service as any, 'handleMessage').mockResolvedValue(undefined);
      await service.handleWebhook(makeMessageBody('/cancel'));
      expect(spy).toHaveBeenCalled();
    });

    it('routes bot_started to handleStartCommand', async () => {
      const spy = jest.spyOn(service as any, 'handleStartCommand').mockResolvedValue(undefined);
      await service.handleWebhook(makeBotStartedBody());
      expect(spy).toHaveBeenCalled();
    });

    it('ignores unknown update_type without throwing', async () => {
      await expect(service.handleWebhook({ update_type: 'unknown_event' })).resolves.toBeUndefined();
    });

    it('ignores null body without throwing', async () => {
      await expect(service.handleWebhook(null)).resolves.toBeUndefined();
    });
  });

  // ── handleMessage: commands ───────────────────────────────────────────────

  describe('handleMessage — /start', () => {
    it('delegates to handleStartCommand', async () => {
      const spy = jest.spyOn(service as any, 'handleStartCommand').mockResolvedValue(undefined);
      await service.handleWebhook(makeMessageBody('/start'));
      expect(spy).toHaveBeenCalled();
    });

    it('passes link payload from /start link_TOKEN', async () => {
      const spy = jest.spyOn(service as any, 'handleStartCommand').mockResolvedValue(undefined);
      await service.handleWebhook(makeMessageBody('/start link_ABC123'));
      const call = spy.mock.calls[0];
      expect(call[3]).toBe('link_ABC123'); // 4th arg = payload
    });
  });

  describe('handleMessage — /generate', () => {
    it('tells unlinked user to register first', async () => {
      await service.handleWebhook(makeMessageBody('/generate'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Аккаунт не найден'),
      );
      expect(sentText).toBeDefined();
    });

    it('sends tool selection keyboard for linked user', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'u1', maxId: '111' });
      await service.handleWebhook(makeMessageBody('/generate'));
      const calls = (mockedAxios.post as jest.Mock).mock.calls.filter(
        ([url]: any) => url.includes('/messages'),
      );
      const withKeyboard = calls.find(([, body]: any) =>
        body?.attachments?.some((a: any) => a.type === 'inline_keyboard'),
      );
      expect(withKeyboard).toBeDefined();
    });
  });

  describe('handleMessage — /cancel', () => {
    it('cancels active gen session', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', { toolKey: 'quiz', fieldIndex: 0, params: {}, lastActivity: Date.now() });

      await service.handleWebhook(makeMessageBody('/cancel'));
      expect(sessions.has('111')).toBe(false);
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('отменена'),
      );
      expect(sentText).toBeDefined();
    });

    it('replies "no active process" when nothing to cancel', async () => {
      await service.handleWebhook(makeMessageBody('/cancel'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Нет активного процесса'),
      );
      expect(sentText).toBeDefined();
    });
  });

  describe('handleMessage — text input for gen session', () => {
    function seedSession(userId = '111') {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set(userId, {
        toolKey: 'quiz',
        fieldIndex: 0, // first field: subject (text, optional)
        params: {},
        lastActivity: Date.now(),
      });
    }

    it('validates required text field and rejects empty', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'quiz',
        fieldIndex: 1, // topic — required text field
        params: {},
        lastActivity: Date.now(),
      });
      await service.handleWebhook(makeMessageBody('   '));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('обязательно'),
      );
      expect(sentText).toBeDefined();
      // session not advanced
      expect(sessions.get('111')?.fieldIndex).toBe(1);
    });

    it('validates max length and rejects too-long input', async () => {
      seedSession();
      const longText = 'а'.repeat(300);
      await service.handleWebhook(makeMessageBody(longText));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Слишком длинный'),
      );
      expect(sentText).toBeDefined();
    });

    it('accepts valid text, stores it, advances fieldIndex', async () => {
      seedSession();
      await service.handleWebhook(makeMessageBody('Математика'));
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.get('111')?.fieldIndex).toBe(1);
      expect(sessions.get('111')?.params.subject).toBe('Математика');
    });

    it('hints to use buttons for multiselect field', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'lesson-preparation',
        fieldIndex: 4, // generationTypes — multiselect
        params: {},
        lastActivity: Date.now(),
      });
      await service.handleWebhook(makeMessageBody('план урока'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Нажмите на кнопки'),
      );
      expect(sentText).toBeDefined();
      // fieldIndex unchanged
      expect(sessions.get('111')?.fieldIndex).toBe(4);
    });

    it('tells user to use web for file fields and clears session', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'photosession',
        fieldIndex: 0, // photoHash — file field
        params: {},
        lastActivity: Date.now(),
      });
      await service.handleWebhook(makeMessageBody('some text'));
      expect(sessions.has('111')).toBe(false);
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('веб-версию'),
      );
      expect(sentText).toBeDefined();
    });

    it('ignores text when no active session', async () => {
      const callsBefore = (mockedAxios.post as jest.Mock).mock.calls.length;
      await service.handleWebhook(makeMessageBody('random message'));
      // No new messages sent
      expect((mockedAxios.post as jest.Mock).mock.calls.length).toBe(callsBefore);
    });
  });

  // ── handleCallback: g:t: tool selection ─────────────────────────────────

  describe('handleCallback — g:t: (tool selection)', () => {
    it('tells unlinked user to use /start', async () => {
      await service.handleWebhook(makeCallbackBody('g:t:quiz'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Аккаунт не найден'),
      );
      expect(sentText).toBeDefined();
    });

    it('creates session and asks first field for linked user', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'u1', maxId: '111' });
      await service.handleWebhook(makeCallbackBody('g:t:quiz'));
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.has('111')).toBe(true);
      expect(sessions.get('111')?.toolKey).toBe('quiz');
    });

    it('ignores unknown tool key', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'u1', maxId: '111' });
      await service.handleWebhook(makeCallbackBody('g:t:nonexistent'));
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.has('111')).toBe(false);
    });

    it('answers callback to dismiss loading state', async () => {
      await service.handleWebhook(makeCallbackBody('g:t:quiz'));
      const answerCall = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url]: any) => url.includes('/answers'),
      );
      expect(answerCall).toBeDefined();
    });
  });

  // ── handleCallback: g:v: option selection ────────────────────────────────

  describe('handleCallback — g:v: (select option)', () => {
    function seedQuizAtField(fieldIdx: number, userId = '111') {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set(userId, {
        toolKey: 'quiz',
        fieldIndex: fieldIdx,
        params: {},
        lastActivity: Date.now(),
      });
    }

    it('replies session expired when no session exists', async () => {
      await service.handleWebhook(makeCallbackBody('g:v:0'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Сессия истекла'),
      );
      expect(sentText).toBeDefined();
    });

    it('stores selected option value and advances fieldIndex', async () => {
      seedQuizAtField(2); // level — select field with SCHOOL_LEVELS
      await service.handleWebhook(makeCallbackBody('g:v:0'));
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.get('111')?.fieldIndex).toBe(3);
      expect(sessions.get('111')?.params.level).toBeDefined();
    });

    it('rejects out-of-range option index', async () => {
      seedQuizAtField(2); // level has 7 options
      await service.handleWebhook(makeCallbackBody('g:v:99'));
      const sessions = (service as any).genSessions as Map<string, any>;
      // fieldIndex unchanged — invalid option
      expect(sessions.get('111')?.fieldIndex).toBe(2);
    });

    it('rejects negative option index', async () => {
      // payload g:v:-1 — after parseInt is NaN-like guard triggers
      seedQuizAtField(2);
      // Manually craft body with negative index check handled inside service
      const body = makeCallbackBody('g:v:-1');
      await service.handleWebhook(body);
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.get('111')?.fieldIndex).toBe(2);
    });
  });

  // ── handleCallback: g:ms: multiselect toggle ─────────────────────────────

  describe('handleCallback — g:ms: (multiselect toggle)', () => {
    function seedMultiselect(userId = '111') {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set(userId, {
        toolKey: 'lesson-preparation',
        fieldIndex: 4, // generationTypes — multiselect
        params: {},
        lastActivity: Date.now(),
        lastKeyboardMessageId: 'msg-1',
      });
    }

    it('replies session expired when no session', async () => {
      await service.handleWebhook(makeCallbackBody('g:ms:0'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Сессия истекла'),
      );
      expect(sentText).toBeDefined();
    });

    it('toggles option ON when not selected', async () => {
      seedMultiselect();
      await service.handleWebhook(makeCallbackBody('g:ms:0'));
      const sessions = (service as any).genSessions as Map<string, any>;
      const selected = sessions.get('111')?.params.generationTypes;
      expect(selected).toContain('lesson-plan');
    });

    it('toggles option OFF when already selected', async () => {
      seedMultiselect();
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.get('111')!.params.generationTypes = 'lesson-plan';
      await service.handleWebhook(makeCallbackBody('g:ms:0'));
      const selected = sessions.get('111')?.params.generationTypes;
      expect(selected).toBe('');
    });

    it('can select multiple options', async () => {
      seedMultiselect();
      await service.handleWebhook(makeCallbackBody('g:ms:0')); // lesson-plan
      await service.handleWebhook(makeCallbackBody('g:ms:1')); // worksheet
      const sessions = (service as any).genSessions as Map<string, any>;
      const selected = sessions.get('111')?.params.generationTypes;
      expect(selected).toContain('lesson-plan');
      expect(selected).toContain('worksheet');
    });

    it('updates keyboard in-place via editMessageKeyboard', async () => {
      seedMultiselect();
      await service.handleWebhook(makeCallbackBody('g:ms:0'));
      const putCall = (mockedAxios.put as jest.Mock).mock.calls.find(
        ([url]: any) => url.includes('/messages'),
      );
      expect(putCall).toBeDefined();
    });

    it('ignores out-of-range option index', async () => {
      seedMultiselect();
      const sessions = (service as any).genSessions as Map<string, any>;
      const fieldIndex = sessions.get('111')?.fieldIndex;
      await service.handleWebhook(makeCallbackBody('g:ms:99'));
      expect(sessions.get('111')?.fieldIndex).toBe(fieldIndex); // unchanged
    });
  });

  // ── handleCallback: g:msok confirm multiselect ───────────────────────────

  describe('handleCallback — g:msok (confirm multiselect)', () => {
    function seedMultiselect(selected = '', userId = '111') {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set(userId, {
        toolKey: 'lesson-preparation',
        fieldIndex: 4,
        params: { generationTypes: selected },
        lastActivity: Date.now(),
      });
    }

    it('replies session expired when no session', async () => {
      await service.handleWebhook(makeCallbackBody('g:msok'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Сессия истекла'),
      );
      expect(sentText).toBeDefined();
    });

    it('rejects confirm when nothing selected', async () => {
      seedMultiselect('');
      await service.handleWebhook(makeCallbackBody('g:msok'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Выберите хотя бы один'),
      );
      expect(sentText).toBeDefined();
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.get('111')?.fieldIndex).toBe(4); // not advanced
    });

    it('advances fieldIndex when at least one option selected', async () => {
      seedMultiselect('lesson-plan,quiz');
      await service.handleWebhook(makeCallbackBody('g:msok'));
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.get('111')?.fieldIndex).toBe(5);
    });
  });

  // ── handleCallback: g:skip ────────────────────────────────────────────────

  describe('handleCallback — g:skip', () => {
    it('does nothing when no active session', async () => {
      const callsBefore = (mockedAxios.post as jest.Mock).mock.calls.filter(
        ([url]: any) => url.includes('/messages'),
      ).length;
      await service.handleWebhook(makeCallbackBody('g:skip'));
      // answer callback still fires, but no "error" message
      const messageCalls = (mockedAxios.post as jest.Mock).mock.calls.filter(
        ([url]: any) => url.includes('/messages'),
      ).length;
      expect(messageCalls).toBe(callsBefore);
    });

    it('rejects skip for required field', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'quiz',
        fieldIndex: 1, // topic — required
        params: {},
        lastActivity: Date.now(),
      });
      await service.handleWebhook(makeCallbackBody('g:skip'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('обязательно'),
      );
      expect(sentText).toBeDefined();
      expect(sessions.get('111')?.fieldIndex).toBe(1);
    });

    it('advances by 1 for optional field without skipToEnd', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'quiz',
        fieldIndex: 0, // subject — optional, no skipToEnd
        params: {},
        lastActivity: Date.now(),
      });
      await service.handleWebhook(makeCallbackBody('g:skip'));
      expect(sessions.get('111')?.fieldIndex).toBe(1);
    });

    it('jumps to end for optional field with skipToEnd', async () => {
      const tool = getToolConfig('unpacking')!;
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'unpacking',
        fieldIndex: 3, // q4 — optional with skipToEnd
        params: {},
        lastActivity: Date.now(),
      });
      await service.handleWebhook(makeCallbackBody('g:skip'));
      expect(sessions.get('111')?.fieldIndex).toBe(tool.fields.length);
    });
  });

  // ── handleCallback: g:ok confirm generation ──────────────────────────────

  describe('handleCallback — g:ok (confirm generation)', () => {
    function seedSession(userId = '111', toolKey = 'quiz') {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set(userId, {
        toolKey,
        fieldIndex: 99, // past all fields
        params: { topic: 'Тест', level: '8 Класс', questionsCount: '10', answersCount: '4' },
        lastActivity: Date.now(),
      });
    }

    it('replies session expired when no session', async () => {
      await service.handleWebhook(makeCallbackBody('g:ok'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Сессия истекла'),
      );
      expect(sentText).toBeDefined();
    });

    it('enforces rate limit', async () => {
      seedSession();
      const lastGenAt = (service as any).lastGenAt as Map<string, number>;
      lastGenAt.set('111', Date.now()); // just generated

      await service.handleWebhook(makeCallbackBody('g:ok'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Подождите'),
      );
      expect(sentText).toBeDefined();
    });

    it('replies not found when user not in DB', async () => {
      seedSession();
      mockPrisma.appUser.findUnique.mockResolvedValue(null);

      await service.handleWebhook(makeCallbackBody('g:ok'));
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Аккаунт не найден'),
      );
      expect(sentText).toBeDefined();
    });

    it('calls generation API and sends success on completed status', async () => {
      seedSession();
      const user = { id: 'u1', maxId: '111', username: 'tester', apiKey: 'key-abc' };
      mockPrisma.appUser.findUnique.mockResolvedValue(user);
      // Call order: answerCallback → sendMessage(progress) → login → generate → sendMessage(success)
      (mockedAxios.post as jest.Mock)
        .mockResolvedValueOnce({ data: {} }) // answerCallback /answers
        .mockResolvedValueOnce({ status: 200, data: { message: { body: { mid: 'msg-1' } } } }) // sendMessage progress
        .mockResolvedValueOnce({ data: { token: 'jwt-123' } }) // login
        .mockResolvedValueOnce({ data: { status: 'completed', remainingCredits: 42 } }) // generate
        .mockResolvedValue({ status: 200, data: { message: { body: { mid: 'msg-2' } } } }); // sendMessage success

      await service.handleWebhook(makeCallbackBody('g:ok'));

      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Готово'),
      );
      expect(sentText).toBeDefined();
    });

    it('calls games API for game tool', async () => {
      seedSession('111', 'game');
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'game',
        fieldIndex: 99,
        params: { type: 'flashcards', topic: 'Таблица умножения' },
        lastActivity: Date.now(),
      });
      const user = { id: 'u1', maxId: '111', username: 'tester', apiKey: 'key-abc' };
      mockPrisma.appUser.findUnique.mockResolvedValue(user);

      (mockedAxios.post as jest.Mock)
        .mockResolvedValueOnce({ data: {} }) // answerCallback
        .mockResolvedValueOnce({ status: 200, data: { message: { body: { mid: 'msg-1' } } } }) // sendMessage progress
        .mockResolvedValueOnce({ data: { token: 'jwt-123' } }) // login
        .mockResolvedValueOnce({ data: { url: 'https://game.example.com/abc' } }) // games api
        .mockResolvedValue({ status: 200, data: { message: { body: { mid: 'msg-99' } } } }); // send message

      await service.handleWebhook(makeCallbackBody('g:ok'));

      const gameCall = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url]: any) => url.includes('/api/games/generate'),
      );
      expect(gameCall).toBeDefined();
    });

    it('splits generationTypes string to array for lesson-preparation', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', {
        toolKey: 'lesson-preparation',
        fieldIndex: 99,
        params: { topic: 'Дроби', level: '5', generationTypes: 'lesson-plan,quiz', depth: 'standard' },
        lastActivity: Date.now(),
      });
      const user = { id: 'u1', maxId: '111', username: 'tester', apiKey: 'key-abc' };
      mockPrisma.appUser.findUnique.mockResolvedValue(user);

      (mockedAxios.post as jest.Mock)
        .mockResolvedValueOnce({ data: {} }) // answerCallback
        .mockResolvedValueOnce({ status: 200, data: { message: { body: { mid: 'msg-1' } } } }) // sendMessage progress
        .mockResolvedValueOnce({ data: { token: 'jwt-123' } }) // login
        .mockResolvedValueOnce({ data: { status: 'completed', remainingCredits: 10 } }) // generate
        .mockResolvedValue({ status: 200, data: { message: { body: { mid: 'msg-99' } } } });

      await service.handleWebhook(makeCallbackBody('g:ok'));

      const genCall = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url]: any) => url.includes('/api/generate/lesson-preparation'),
      );
      expect(genCall).toBeDefined();
      const body = genCall![1];
      expect(Array.isArray(body.generationTypes)).toBe(true);
      expect(body.generationTypes).toEqual(['lesson-plan', 'quiz']);
    });

    it('removes session after confirmation', async () => {
      seedSession();
      mockPrisma.appUser.findUnique.mockResolvedValue(null);
      await service.handleWebhook(makeCallbackBody('g:ok'));
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.has('111')).toBe(false);
    });

    it('sends humanized error on API failure', async () => {
      seedSession();
      const user = { id: 'u1', maxId: '111', username: 'tester', apiKey: 'key-abc' };
      mockPrisma.appUser.findUnique.mockResolvedValue(user);

      (mockedAxios.post as jest.Mock)
        .mockResolvedValueOnce({ data: {} }) // answerCallback
        .mockResolvedValueOnce({ status: 200, data: { message: { body: { mid: 'msg-1' } } } }) // sendMessage progress
        .mockResolvedValueOnce({ data: { token: 'jwt-123' } }) // login
        .mockRejectedValueOnce(new Error('недостаточно токенов')) // generate
        .mockResolvedValue({ status: 200, data: { message: { body: { mid: 'msg-99' } } } });

      await service.handleWebhook(makeCallbackBody('g:ok'));

      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('токенов'),
      );
      expect(sentText).toBeDefined();
    });
  });

  // ── handleCallback: g:no cancel ──────────────────────────────────────────

  describe('handleCallback — g:no', () => {
    it('clears session and sends cancellation message', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('111', { toolKey: 'quiz', fieldIndex: 0, params: {}, lastActivity: Date.now() });

      await service.handleWebhook(makeCallbackBody('g:no'));

      expect(sessions.has('111')).toBe(false);
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('отменена'),
      );
      expect(sentText).toBeDefined();
    });
  });

  // ── handleCallback: payload guards ───────────────────────────────────────

  describe('handleCallback — payload guards', () => {
    it('ignores payload not starting with g:', async () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      const sizeBefore = sessions.size;
      await service.handleWebhook(makeCallbackBody('some:other:data'));
      expect(sessions.size).toBe(sizeBefore);
    });

    it('ignores oversized payload (> 32 chars)', async () => {
      await service.handleWebhook(makeCallbackBody('g:t:' + 'x'.repeat(50)));
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.has('111')).toBe(false);
    });
  });

  // ── handleStartCommand ────────────────────────────────────────────────────

  describe('handleStartCommand', () => {
    it('shows web registration prompt for unlinked user', async () => {
      await service.handleWebhook(makeBotStartedBody());
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('зарегистрируйтесь'),
      );
      expect(sentText).toBeDefined();
    });

    it('shows welcome + tool selection keyboard for linked user', async () => {
      const user = { id: 'u1', maxId: '111', username: 'tester', firstName: 'Test', lastName: '', chatId: null, maxChatId: null };
      mockPrisma.appUser.findUnique.mockResolvedValue(user);
      mockPrisma.appUser.update.mockResolvedValue(user);

      await service.handleWebhook(makeBotStartedBody());

      const msgCalls = (mockedAxios.post as jest.Mock).mock.calls.filter(
        ([url]: any) => url.includes('/messages'),
      );
      // First message: welcome text
      const welcomeCall = msgCalls.find(([, body]: any) => body?.text?.includes('prepodavAI'));
      expect(welcomeCall).toBeDefined();
      // Second message: tool selection keyboard
      const keyboardCall = msgCalls.find(([, body]: any) =>
        body?.attachments?.some((a: any) => a.type === 'inline_keyboard'),
      );
      expect(keyboardCall).toBeDefined();
    });

    it('updates lastAccessAt, chatId, maxChatId for linked user', async () => {
      const user = { id: 'u1', maxId: '111', username: 'tester', firstName: 'Test', lastName: '', chatId: null, maxChatId: null };
      mockPrisma.appUser.findUnique.mockResolvedValue(user);
      mockPrisma.appUser.update.mockResolvedValue(user);

      await service.handleWebhook(makeBotStartedBody('111', '999'));

      expect(mockPrisma.appUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastAccessAt: expect.any(Date), chatId: '999', maxChatId: '999' }),
        }),
      );
    });

    it('delegates to handleLinkToken when link_ payload present', async () => {
      const spy = jest.spyOn(service as any, 'handleLinkToken').mockResolvedValue(undefined);
      await service.handleWebhook(makeMessageBody('/start link_ABC123'));
      expect(spy).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'ABC123');
    });
  });

  // ── handleLinkToken ───────────────────────────────────────────────────────

  describe('handleLinkToken', () => {
    const maxUser = { id: '111', username: 'tester', first_name: 'Test', last_name: '' };
    const webUser = { id: 'web-1', firstName: 'Web', lastName: 'User' };

    function makeValidToken(overrides = {}) {
      return {
        id: 'lt-1',
        token: 'ABC123',
        userId: 'web-1',
        platform: 'max',
        status: 'pending',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        ...overrides,
      };
    }

    it('links MAX to web account on valid token', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken());
      mockPrisma.appUser.findUnique
        .mockResolvedValueOnce(null)   // alreadyLinked check
        .mockResolvedValueOnce(webUser); // webUser fetch

      await (service as any).handleLinkToken(maxUser, '111', 'ABC123');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('успешно привязан'),
      );
      expect(sentText).toBeDefined();
    });

    it('rejects token not found', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(null);
      await (service as any).handleLinkToken(maxUser, '111', 'BADTOKEN');
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('не найден'),
      );
      expect(sentText).toBeDefined();
    });

    it('rejects non-max platform token', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken({ platform: 'telegram' }));
      await (service as any).handleLinkToken(maxUser, '111', 'ABC123');
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('не найден'),
      );
      expect(sentText).toBeDefined();
    });

    it('rejects already used token (status=completed)', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken({ status: 'completed' }));
      await (service as any).handleLinkToken(maxUser, '111', 'ABC123');
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('уже использован'),
      );
      expect(sentText).toBeDefined();
    });

    it('rejects expired token and updates status', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(
        makeValidToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await (service as any).handleLinkToken(maxUser, '111', 'ABC123');
      expect(mockPrisma.linkToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'expired' } }),
      );
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('истёк'),
      );
      expect(sentText).toBeDefined();
    });

    it('rejects if MAX account already linked to a different user', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken({ userId: 'web-1' }));
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'other-user' }); // alreadyLinked
      await (service as any).handleLinkToken(maxUser, '111', 'ABC123');
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('уже привязан к другому профилю'),
      );
      expect(sentText).toBeDefined();
    });

    it('rejects when web user not found', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken());
      mockPrisma.appUser.findUnique
        .mockResolvedValueOnce(null)  // alreadyLinked
        .mockResolvedValueOnce(null); // webUser not found
      await (service as any).handleLinkToken(maxUser, '111', 'ABC123');
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Аккаунт не найден'),
      );
      expect(sentText).toBeDefined();
    });
  });

  // ── Generation session management ─────────────────────────────────────────

  describe('createGenSession', () => {
    it('creates a new session', () => {
      const session = (service as any).createGenSession('u1', 'quiz');
      expect(session.toolKey).toBe('quiz');
      expect(session.fieldIndex).toBe(0);
      expect(session.params).toEqual({});
    });

    it('replaces existing session for same user', () => {
      (service as any).createGenSession('u1', 'quiz');
      const session2 = (service as any).createGenSession('u1', 'worksheet');
      expect(session2.toolKey).toBe('worksheet');
      const sessions = (service as any).genSessions as Map<string, any>;
      expect(sessions.size).toBe(1);
    });

    it('cleans up expired sessions on create', () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('stale-user', {
        toolKey: 'quiz',
        fieldIndex: 0,
        params: {},
        lastActivity: Date.now() - 15 * 60_000, // 15 min ago — expired
      });
      (service as any).createGenSession('new-user', 'quiz');
      expect(sessions.has('stale-user')).toBe(false);
    });

    it('throws when at MAX_GEN_SESSIONS limit', () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      for (let i = 0; i < 300; i++) {
        sessions.set(`flood-${i}`, { toolKey: 'quiz', fieldIndex: 0, params: {}, lastActivity: Date.now() });
      }
      expect(() => (service as any).createGenSession('new-user', 'quiz')).toThrow('перегружен');
    });
  });

  describe('getGenSession', () => {
    it('returns undefined for unknown userId', () => {
      expect((service as any).getGenSession('nobody')).toBeUndefined();
    });

    it('returns undefined and removes expired session', () => {
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('u1', { toolKey: 'quiz', fieldIndex: 0, params: {}, lastActivity: Date.now() - 15 * 60_000 });
      expect((service as any).getGenSession('u1')).toBeUndefined();
      expect(sessions.has('u1')).toBe(false);
    });

    it('returns session and refreshes lastActivity', () => {
      const oldTime = Date.now() - 60_000;
      const sessions = (service as any).genSessions as Map<string, any>;
      sessions.set('u1', { toolKey: 'quiz', fieldIndex: 0, params: {}, lastActivity: oldTime });
      const result = (service as any).getGenSession('u1');
      expect(result).toBeDefined();
      expect(result.lastActivity).toBeGreaterThan(oldTime);
    });
  });

  // ── Keyboard builders ──────────────────────────────────────────────────────

  describe('buildToolSelectionAttachment', () => {
    it('includes all tool configs as callback buttons', () => {
      const attachment = (service as any).buildToolSelectionAttachment();
      expect(attachment).toHaveLength(1);
      expect(attachment[0].type).toBe('inline_keyboard');
      const allButtons: any[] = attachment[0].payload.buttons.flat();
      for (const tool of TOOL_CONFIGS) {
        const btn = allButtons.find((b: any) => b.payload === `g:t:${tool.key}`);
        expect(btn).toBeDefined();
      }
    });

    it('groups buttons in rows of 2', () => {
      const attachment = (service as any).buildToolSelectionAttachment();
      const rows: any[][] = attachment[0].payload.buttons;
      for (const row of rows) {
        expect(row.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('buildMultiselectAttachment', () => {
    it('marks selected options with checkmark', () => {
      const tool = getToolConfig('lesson-preparation')!;
      const field = tool.fields[4]; // generationTypes
      const session: any = { params: { generationTypes: 'lesson-plan' }, toolKey: 'lesson-preparation', fieldIndex: 4, lastActivity: Date.now() };
      const attachment = (service as any).buildMultiselectAttachment(field, session);
      const allButtons: any[] = attachment[0].payload.buttons.flat();
      const selectedBtn = allButtons.find((b: any) => b.payload === 'g:ms:0');
      expect(selectedBtn.text).toContain('✅');
    });

    it('marks unselected options with empty checkbox', () => {
      const tool = getToolConfig('lesson-preparation')!;
      const field = tool.fields[4];
      const session: any = { params: { generationTypes: '' }, toolKey: 'lesson-preparation', fieldIndex: 4, lastActivity: Date.now() };
      const attachment = (service as any).buildMultiselectAttachment(field, session);
      const allButtons: any[] = attachment[0].payload.buttons.flat();
      const unselectedBtn = allButtons.find((b: any) => b.payload === 'g:ms:0');
      expect(unselectedBtn.text).toContain('☐');
    });

    it('includes g:msok confirm button', () => {
      const tool = getToolConfig('lesson-preparation')!;
      const field = tool.fields[4];
      const session: any = { params: { generationTypes: '' }, toolKey: 'lesson-preparation', fieldIndex: 4, lastActivity: Date.now() };
      const attachment = (service as any).buildMultiselectAttachment(field, session);
      const allButtons: any[] = attachment[0].payload.buttons.flat();
      expect(allButtons.find((b: any) => b.payload === 'g:msok')).toBeDefined();
    });

    it('returns null for non-multiselect field', () => {
      const tool = getToolConfig('quiz')!;
      const field = tool.fields[0]; // subject — text
      const session: any = { params: {}, toolKey: 'quiz', fieldIndex: 0, lastActivity: Date.now() };
      expect((service as any).buildMultiselectAttachment(field, session)).toBeNull();
    });
  });

  describe('buildFieldAttachment', () => {
    it('returns file-cancel-only keyboard for file field', () => {
      const tool = getToolConfig('photosession')!;
      const field = tool.fields[0]; // photoHash — file
      const session: any = { params: {}, toolKey: 'photosession', fieldIndex: 0, lastActivity: Date.now() };
      const attachment = (service as any).buildFieldAttachment(field, session);
      const allButtons: any[] = attachment[0].payload.buttons.flat();
      expect(allButtons.every((b: any) => b.payload === 'g:no')).toBe(true);
    });

    it('returns option buttons for select field', () => {
      const tool = getToolConfig('quiz')!;
      const field = tool.fields[2]; // level — select
      const session: any = { params: {}, toolKey: 'quiz', fieldIndex: 2, lastActivity: Date.now() };
      const attachment = (service as any).buildFieldAttachment(field, session);
      expect(attachment).not.toBeNull();
      const allButtons: any[] = attachment![0].payload.buttons.flat();
      const optionButtons = allButtons.filter((b: any) => b.payload.startsWith('g:v:'));
      expect(optionButtons.length).toBe(field.options!.length);
    });

    it('includes skip button for optional text field with skipLabel', () => {
      const tool = getToolConfig('quiz')!;
      const field = tool.fields[0]; // subject — optional text with skipLabel
      const session: any = { params: {}, toolKey: 'quiz', fieldIndex: 0, lastActivity: Date.now() };
      const attachment = (service as any).buildFieldAttachment(field, session);
      const allButtons: any[] = attachment![0].payload.buttons.flat();
      const skipBtn = allButtons.find((b: any) => b.payload === 'g:skip');
      expect(skipBtn).toBeDefined();
    });

    it('returns null for required text field with no options', () => {
      const tool = getToolConfig('quiz')!;
      const field = tool.fields[1]; // topic — required text, no options
      const session: any = { params: {}, toolKey: 'quiz', fieldIndex: 1, lastActivity: Date.now() };
      expect((service as any).buildFieldAttachment(field, session)).toBeNull();
    });
  });

  describe('buildConfirmMessage', () => {
    it('includes tool name, params, credit cost, estimated time, and generation prompt', () => {
      const tool = getToolConfig('quiz')!;
      const msg = (service as any).buildConfirmMessage(tool, { topic: 'Клетка', level: '8 Класс', questionsCount: '10' });
      expect(msg).toContain(tool.label);
      expect(msg).toContain('Клетка');
      expect(msg).toContain(String(tool.creditCost));
      expect(msg).toContain(tool.estimatedTime);
      expect(msg).toContain('Генерировать?');
    });
  });

  // ── ensureApiKey ───────────────────────────────────────────────────────────

  describe('ensureApiKey', () => {
    it('returns existing apiKey without DB call', async () => {
      const user: any = { id: 'u1', apiKey: 'existing-key' };
      const result = await (service as any).ensureApiKey(user);
      expect(result).toBe('existing-key');
      expect(mockPrisma.appUser.update).not.toHaveBeenCalled();
    });

    it('generates and stores new apiKey when missing', async () => {
      const user: any = { id: 'u1', apiKey: null };
      const result = await (service as any).ensureApiKey(user);
      expect(result).toBeTruthy();
      expect(mockPrisma.appUser.update).toHaveBeenCalled();
      expect(user.apiKey).toBe(result);
    });
  });

  // ── getApiToken ────────────────────────────────────────────────────────────

  describe('getApiToken', () => {
    it('returns token on successful login', async () => {
      (mockedAxios.post as jest.Mock).mockResolvedValueOnce({ data: { token: 'jwt-abc' } });
      const result = await (service as any).getApiToken('user', 'api-key');
      expect(result).toBe('jwt-abc');
    });

    it('returns null on login failure', async () => {
      (mockedAxios.post as jest.Mock).mockRejectedValueOnce({ response: { status: 401, data: {} }, message: 'Unauthorized' });
      const result = await (service as any).getApiToken('user', 'bad-key');
      expect(result).toBeNull();
    });

    it('returns null when token missing from response', async () => {
      (mockedAxios.post as jest.Mock).mockResolvedValueOnce({ data: {} });
      const result = await (service as any).getApiToken('user', 'key');
      expect(result).toBeNull();
    });
  });

  // ── humanizeError ─────────────────────────────────────────────────────────

  describe('humanizeError', () => {
    it('returns token hint for credit-related errors', () => {
      expect((service as any).humanizeError(new Error('недостаточно токенов'))).toContain('токенов');
      expect((service as any).humanizeError(new Error('баланс'))).toContain('токенов');
      expect((service as any).humanizeError(new Error('кредит'))).toContain('токенов');
    });

    it('returns account hint for not-found errors', () => {
      const msg = (service as any).humanizeError(new Error('не найден'));
      expect(msg).toContain('Аккаунт не найден');
    });

    it('returns generic message for unrecognized errors', () => {
      const msg = (service as any).humanizeError(new Error('ECONNREFUSED'));
      expect(msg).toContain('Произошла ошибка');
    });
  });

  // ── sanitize ──────────────────────────────────────────────────────────────

  describe('sanitize', () => {
    it('strips control characters', () => {
      const result = (service as any).sanitize('hello\x00\x1F world');
      expect(result).toBe('hello world');
    });

    it('trims whitespace', () => {
      expect((service as any).sanitize('  hello  ')).toBe('hello');
    });

    it('preserves normal text unchanged', () => {
      expect((service as any).sanitize('Математика')).toBe('Математика');
    });
  });

  // ── validateText ──────────────────────────────────────────────────────────

  describe('validateText', () => {
    const field: any = { required: true, maxLength: 100, key: 'topic', label: 'Тема', type: 'text' };

    it('returns error for empty required field', () => {
      expect((service as any).validateText('', field)).toContain('обязательно');
    });

    it('returns error when exceeds maxLength', () => {
      const longText = 'а'.repeat(101);
      expect((service as any).validateText(longText, field)).toContain('100');
    });

    it('returns null for valid input', () => {
      expect((service as any).validateText('Квадратные уравнения', field)).toBeNull();
    });

    it('allows empty value for optional field', () => {
      const optField = { ...field, required: false };
      expect((service as any).validateText('', optField)).toBeNull();
    });
  });

  // ── resolveOptionByIndex ──────────────────────────────────────────────────

  describe('resolveOptionByIndex', () => {
    const tool = getToolConfig('quiz')!;
    const levelField = tool.fields[2]; // level — CLASS_GRADES

    it('returns option value for valid index', () => {
      const result = (service as any).resolveOptionByIndex(levelField, 0, {});
      expect(result).toBe('1 Класс');
    });

    it('returns null for out-of-range index', () => {
      expect((service as any).resolveOptionByIndex(levelField, 999, {})).toBeNull();
    });

    it('returns null for negative index', () => {
      expect((service as any).resolveOptionByIndex(levelField, -1, {})).toBeNull();
    });
  });

  // ── sendGenerationResult ──────────────────────────────────────────────────

  describe('sendGenerationResult', () => {
    it('returns failure when user not found', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue(null);
      const result = await service.sendGenerationResult({ userId: 'u1', generationType: 'quiz', result: {}, generationRequestId: 'r1' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('MAX not linked');
    });

    it('returns failure when user has no maxId', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'u1', maxId: null });
      const result = await service.sendGenerationResult({ userId: 'u1', generationType: 'quiz', result: {}, generationRequestId: 'r1' });
      expect(result.success).toBe(false);
    });

    it('returns failure when no chatId available', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'u1', maxId: '111', maxChatId: null, chatId: null, source: 'web' });
      const result = await service.sendGenerationResult({ userId: 'u1', generationType: 'quiz', result: { content: '<p>html</p>' }, generationRequestId: 'r1' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('No MAX chatId');
    });

    it('sends text result and returns success', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'u1', maxId: '111', maxChatId: '111', source: 'max' });
      // uploadAndSendFile mocking — needs upload URL + upload + send
      (mockedAxios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { url: 'https://upload.example.com' } }) // /uploads?type=file
        .mockResolvedValueOnce({ data: { token: 'file-token-abc' } }) // upload
        .mockResolvedValueOnce({ status: 200, data: { message: { body: { mid: 'msg-99' } } } }); // send message

      const result = await service.sendGenerationResult({ userId: 'u1', generationType: 'quiz', result: { content: '<p>test</p>' }, generationRequestId: 'r1' });
      expect(result.success).toBe(true);
    });

    it('still returns success when PDF generation fails (resilient fallback)', async () => {
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'u1', maxId: '111', maxChatId: '111', source: 'max' });
      // PDF generation fails — sendTextResult catches internally and sends a fallback text message
      mockHtmlExport.htmlToPdf.mockRejectedValue(new Error('puppeteer error'));
      const result = await service.sendGenerationResult({ userId: 'u1', generationType: 'quiz', result: { content: 'test' }, generationRequestId: 'r1' });
      // Service is resilient: fallback text message is sent even when PDF fails
      expect(result.success).toBe(true);
      // Upload should not have been attempted after PDF failure
      const uploadCall = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url]: any) => url.includes('/uploads'),
      );
      expect(uploadCall).toBeUndefined();
    });
  });

  // ── sendBroadcastMessage ───────────────────────────────────────────────────

  describe('sendBroadcastMessage', () => {
    it('sends message with "от администратора" prefix', async () => {
      await service.sendBroadcastMessage('222', 'Привет, учителя!');
      const sentCall = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('от администратора'),
      );
      expect(sentCall).toBeDefined();
      expect(sentCall![1].text).toContain('Привет, учителя!');
    });
  });

  // ── subscribeWebhook ───────────────────────────────────────────────────────

  describe('subscribeWebhook', () => {
    it('throws when no token configured', async () => {
      const module = await Test.createTestingModule({
        providers: [
          MaxService,
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
          { provide: PrismaService, useValue: mockPrisma },
          { provide: HtmlExportService, useValue: mockHtmlExport },
        ],
      }).compile();
      const svc = module.get<MaxService>(MaxService);
      await expect(svc.subscribeWebhook('https://example.com/webhook')).rejects.toThrow('MAX_BOT_TOKEN is missing');
    });

    it('POSTs subscription with correct update_types', async () => {
      (mockedAxios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: { ok: true } });
      await service.subscribeWebhook('https://example.com/webhook');
      const subCall = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/subscriptions') && Array.isArray(body?.update_types),
      );
      expect(subCall).toBeDefined();
      expect(subCall![1].update_types).toContain('message_callback');
      expect(subCall![1].url).toBe('https://example.com/webhook');
    });

    it('throws on API error', async () => {
      (mockedAxios.post as jest.Mock).mockRejectedValueOnce({ response: { data: { error: 'bad request' } }, message: 'Request failed' });
      await expect(service.subscribeWebhook('https://example.com/webhook')).rejects.toThrow('Failed to subscribe');
    });
  });

  // ── nextStep ──────────────────────────────────────────────────────────────

  describe('nextStep', () => {
    it('shows confirmation when all fields answered', async () => {
      const tool = getToolConfig('quiz')!;
      const session: any = { toolKey: 'quiz', fieldIndex: tool.fields.length, params: { topic: 'Клетка' }, lastActivity: Date.now() };
      await (service as any).nextStep('111', session, tool);
      const sentText = (mockedAxios.post as jest.Mock).mock.calls.find(
        ([url, body]: any) => url.includes('/messages') && body?.text?.includes('Генерировать?'),
      );
      expect(sentText).toBeDefined();
    });

    it('asks next field when fields remain', async () => {
      const tool = getToolConfig('quiz')!;
      const session: any = { toolKey: 'quiz', fieldIndex: 0, params: {}, lastActivity: Date.now() };
      // spy to capture what askField does
      const spy = jest.spyOn(service as any, 'askField').mockResolvedValue(undefined);
      await (service as any).nextStep('111', session, tool);
      expect(spy).toHaveBeenCalledWith('111', tool, session);
    });
  });
});
