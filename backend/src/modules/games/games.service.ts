import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { GigachatService } from '../gigachat/gigachat.service';
import { CreateGameDto, GameType } from './dto/create-game.dto';

@Injectable()
export class GamesService {
    private readonly logger = new Logger(GamesService.name);
    private readonly gamesDir: string;
    private readonly templatesDir: string;

    constructor(
        private readonly gigachatService: GigachatService,
        private readonly configService: ConfigService,
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

    async generateGame(dto: CreateGameDto) {
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

        const jsonString = JSON.stringify(gameDataWithMeta, null, 2);
        let gameHtml = templateContent.replace('{{GAME_DATA}}', jsonString);

        // Also replace {{TOPIC}} placeholder if present
        gameHtml = gameHtml.replace(/\{\{TOPIC\}\}/g, topic);

        // 5. Save File
        const gameId = uuidv4();
        const fileName = `${gameId}.html`;
        const filePath = path.join(this.gamesDir, fileName);
        await fs.writeFile(filePath, gameHtml);

        // 6. Return URL
        const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
        return {
            success: true,
            gameId,
            url: `${baseUrl}/api/games/${gameId}`,
            downloadUrl: `${baseUrl}/api/games/${gameId}/download`,
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
Нужно 15-20 слов с подсказками.
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

            // 3. Fix escape sequences - remove invalid escapes
            // Keep only valid JSON escape sequences: \" \\ \/ \b \f \n \r \t \uXXXX
            // Replace any other \X with just X
            jsonString = jsonString.replace(/\\([^"\\/bfnrtu])/g, '$1');

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
