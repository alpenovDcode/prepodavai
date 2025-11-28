import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { GigachatService } from '../gigachat/gigachat.service';
import { CreateGameDto, GameType } from './dto/create-game.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GamesService {
    private readonly logger = new Logger(GamesService.name);
    private readonly gamesDir: string;
    private readonly templatesDir: string;

    constructor(
        private readonly gigachatService: GigachatService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService, // Added PrismaService injection
    ) {
        const uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
        this.gamesDir = path.join(path.resolve(uploadDir), 'games');
        this.templatesDir = path.join(process.cwd(), 'src', 'templates', 'games');
        this.ensureGamesDir();
    }

    private async ensureGamesDir() {
        try {
            await fs.mkdir(this.gamesDir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create games directory', error);
        }
    }

    async generateGame(dto: CreateGameDto, userId: string) { // Modified signature
        const { topic, type } = dto;
        this.logger.log(`Generating game ${type} for topic: ${topic}`);

        // 1. Get Prompt
        const prompt = this.getPrompt(type, topic);

        // 2. Call AI
        const jsonResponse = await this.callAi(prompt);
        if (!jsonResponse) {
            throw new Error('Failed to generate game data');
        }

        // 3. Load Template
        const templatePath = path.join(this.templatesDir, `${type}.html`);
        let templateContent = '';
        try {
            templateContent = await fs.readFile(templatePath, 'utf-8');
        } catch (e) {
            this.logger.error(`Template not found: ${templatePath}`);
            throw new NotFoundException(`Template for ${type} not found`);
        }

        // 4. Inject data into template
        // Wrap the AI-generated data with metadata (topic, type)
        const gameDataWithMeta = {
            topic: topic,
            type: type,
            data: jsonResponse
        };

        this.logger.debug(`Game data structure: ${JSON.stringify(gameDataWithMeta, null, 2).substring(0, 500)}...`);

        const jsonString = JSON.stringify(gameDataWithMeta, null, 2);
        // Replace both {{GAME_DATA}} and {{ GAME_DATA }} (with spaces)
        // Also fix escape sequences for LaTeX
        const cleanedJsonString = jsonString.replace(/\\(u[0-9a-fA-F]{4}|[^])/g, (match, group1) => {
            if (group1.length === 5 && group1.startsWith('u')) return match;
            const char = group1;
            if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(char)) return match;
            return '\\\\' + char;
        });

        let gameHtml = templateContent.replace(/\{\{\s*GAME_DATA\s*\}\}/g, cleanedJsonString); // Used cleanedJsonString

        // Also replace {{TOPIC}} placeholder if present
        gameHtml = gameHtml.replace(/\{\{TOPIC\}\}/g, topic);

        this.logger.debug(`Template placeholders replaced, HTML length: ${gameHtml.length}`);

        // 5. Save File
        const gameId = uuidv4();
        const fileName = `${gameId}.html`;
        const filePath = path.join(this.gamesDir, fileName);
        await fs.writeFile(filePath, gameHtml);

        // 6. Return URL
        const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
        const gameUrl = `${baseUrl}/api/games/${gameId}`;
        const downloadUrl = `${baseUrl}/api/games/${gameId}/download`;

        // 7. Save to Database
        try {
            // Create GenerationRequest
            const generationRequest = await this.prisma.generationRequest.create({
                data: {
                    userId,
                    type: `game_${type}`,
                    status: 'completed',
                    params: dto as any,
                    result: {
                        gameId,
                        url: gameUrl,
                        downloadUrl,
                        topic,
                        type
                    },
                    model: 'GigaChat', // Assuming GigaChat is used
                }
            });

            // Create UserGeneration
            await this.prisma.userGeneration.create({
                data: {
                    userId,
                    generationType: `game_${type}`,
                    status: 'completed',
                    inputParams: dto as any,
                    outputData: {
                        gameId,
                        url: gameUrl,
                        downloadUrl,
                        topic,
                        type
                    },
                    model: 'GigaChat',
                    generationRequestId: generationRequest.id,
                }
            });

            this.logger.log(`Saved game generation to DB for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to save game generation to DB: ${error.message}`, error.stack);
            // We don't throw here to avoid failing the request if DB save fails, 
            // but in production you might want to handle this differently.
        }

        return {
            success: true,
            gameId,
            url: gameUrl,
            downloadUrl,
        };
    }

    async getGameFile(gameId: string) {
        const filePath = path.join(this.gamesDir, `${gameId}.html`);
        try {
            await fs.access(filePath);
            return fs.readFile(filePath);
        } catch (e) {
            throw new NotFoundException('Game not found');
        }
    }

    private getPrompt(type: GameType, topic: string): string {
        const basePrompt = `Ты генератор контента для образовательных игр. Твоя задача - создать JSON структуру с данными для игры на тему "${topic}".
    Ответ должен содержать ТОЛЬКО валидный JSON, без markdown разметки и лишнего текста.`;

        switch (type) {
            case GameType.MILLIONAIRE:
                return `
Создай базу вопросов для игры "Кто хочет стать миллионером" на тему "${topic}".
Нужно 15 вопросов разной сложности (от легких к сложным).
Верни ТОЛЬКО валидный JSON массив объектов без лишнего текста и разметки.
Формат:
[
  {
    "q": "Текст вопроса",
    "a": ["Вариант A", "Вариант B", "Вариант C", "Вариант D"],
    "correct": 0 // индекс правильного ответа (0-3)
  }
]
`;
            case GameType.FLASHCARDS:
                return `
Создай набор флеш-карточек для изучения темы "${topic}".
Нужно 10-15 карточек.
Верни ТОЛЬКО валидный JSON массив объектов без лишнего текста.
Формат:
[
  {
    "front": "Термин или вопрос",
    "back": "Определение или ответ"
  }
]
`;
            case GameType.MEMORY:
                return `
Создай пары для игры "Найди пару" (Memory) на тему "${topic}".
Нужно 8 пар (всего 16 карточек).
Верни ТОЛЬКО валидный JSON массив объектов без лишнего текста.
Формат:
[
  {
    "id": 1,
    "card1": "Первый элемент пары (например, Страна)",
    "card2": "Второй элемент пары (например, Столица)"
  }
]
`;
            case GameType.CROSSWORD:
                return `
Создай список слов для кроссворда/филворда на тему "${topic}".
Нужно 10-15 слов с подсказками.
ВАЖНО: Слова должны быть БЕЗ ПРОБЕЛОВ. Если термин состоит из нескольких слов, объедини их (например, "МАТЕМАТИЧЕСКОЕОЖИДАНИЕ" вместо "МАТЕМАТИЧЕСКОЕ ОЖИДАНИЕ").
Верни ТОЛЬКО валидный JSON массив объектов без лишнего текста.
Формат:
[
  {
    "word": "СЛОВО",
    "clue": "Подсказка к слову"
  }
]
`;
            case GameType.TRUE_FALSE:
                return `
Создай список утверждений для игры "Правда или Ложь" на тему "${topic}".
Нужно 15 утверждений.
Верни ТОЛЬКО валидный JSON массив объектов без лишнего текста.
Формат:
[
  {
    "statement": "Текст утверждения",
    "isTrue": true, // или false
    "explanation": "Краткое объяснение, почему это так"
  }
]
`;

            default:
                throw new Error('Unknown game type');
        }
    }

    private async callAi(prompt: string): Promise<any> {
        try {
            const response = await this.gigachatService.createChatCompletion({
                model: this.gigachatService.getDefaultModel('chat'),
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 5000,
            }) as any;

            let content = response.choices[0].message.content;
            this.logger.debug(`Raw AI response length: ${content.length}`);

            // Clean up markdown code blocks if present
            content = content.replace(/```json\n?|\n?```/g, '').trim();

            // Remove any leading/trailing text that's not JSON
            const jsonMatch = content.match(/\[[\s\S]*\]/) || content.match(/\{[\s\S]*\}/);

            if (!jsonMatch) {
                this.logger.error('No JSON found in AI response');
                return null;
            }

            let jsonString = jsonMatch[0];

            // Fix common JSON issues from AI responses
            // 1. Replace smart quotes with regular quotes
            jsonString = jsonString.replace(/[""]/g, '"').replace(/['']/g, "'");

            // 2. Remove comments (// ...) which are not valid in JSON
            jsonString = jsonString.replace(/\/\/[^\n]*/g, '');

            // 3. Fix escape sequences - escape invalid backslashes (e.g. \l in \ln, \f in \frac)
            // Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX
            // We want to preserve valid escapes, but escape the backslash for others (e.g. \ln -> \\ln)
            jsonString = jsonString.replace(/\\(u[0-9a-fA-F]{4}|[^])/g, (match, group1) => {
                // If it matched a valid unicode escape \uXXXX
                if (group1.length === 5 && group1.startsWith('u')) {
                    return match;
                }
                // If it matched a single character
                const char = group1;
                if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(char)) {
                    return match; // Keep valid single-char escapes
                }
                // Otherwise, it's an invalid escape (like \l, \a, etc.), so escape the backslash
                return '\\\\' + char;
            });

            // 4. Remove trailing commas before ] or }
            jsonString = jsonString.replace(/,(\s*[\]}])/g, '$1');

            try {
                const parsed = JSON.parse(jsonString);
                this.logger.debug(`Successfully parsed JSON, type: ${Array.isArray(parsed) ? 'array' : 'object'}`);
                return parsed;
            } catch (parseError) {
                this.logger.error(`JSON parse error: ${parseError.message}`);
                this.logger.debug(`Problematic JSON at position ${parseError.message.match(/\d+/)?.[0]}`);

                // Log more context around the error position
                const errorPos = parseInt(parseError.message.match(/\d+/)?.[0] || '0');
                const start = Math.max(0, errorPos - 100);
                const end = Math.min(jsonString.length, errorPos + 100);
                this.logger.debug(`Context: ...${jsonString.substring(start, end)}...`);

                return null;
            }
        } catch (error) {
            this.logger.error('AI generation failed', error);
            return null;
        }
    }
}
