import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ReplicateService } from '../replicate/replicate.service';
import { CreateGameDto, GameType } from './dto/create-game.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
// import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { LessonsService } from '../lessons/lessons.service';

function clampCount(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);
  private readonly gamesDir: string;
  private readonly templatesDir: string;

  constructor(
    private readonly replicateService: ReplicateService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly lessonsService: LessonsService,
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

  async generateGame(dto: CreateGameDto, userId: string) {
    // Modified signature
    const { topic, type, level, count, difficulty } = dto;
    this.logger.log(`Generating game ${type} for topic: ${topic}`);

    // 1. Get Prompt
    const prompt = this.getPrompt(type, topic, level, count, difficulty);

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
      data: jsonResponse,
    };

    this.logger.debug(
      `Game data structure: ${JSON.stringify(gameDataWithMeta, null, 2).substring(0, 500)}...`,
    );

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

    // 4b. Inject universal "report-result-to-parent" bridge.
    // Слушает появление финальных экранов любой из встроенных игр
    // (truefalse / memory / crossword / millionaire / flashcards) и шлёт
    // window.parent.postMessage(...) с результатом, чтобы страница ученика
    // могла записать его в submission.formData.
    gameHtml = this.injectResultBridge(gameHtml, { topic, type });

    // 5. Save File
    const gameId = uuidv4();
    const fileName = `${gameId}.html`;
    const filePath = path.join(this.gamesDir, fileName);
    await fs.writeFile(filePath, gameHtml);

    // 6. Return URL
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
    const contentBaseUrl = this.configService.get<string>('CONTENT_BASE_URL') || baseUrl;

    const gameUrl = `${contentBaseUrl}/api/games/${gameId}`;
    const downloadUrl = `${contentBaseUrl}/api/games/${gameId}/download`;

    // 7. Save to Database & Debit Credits
    let userGenerationId: string | null = null;
    try {
      const defaultLesson = await this.lessonsService.findOrCreateDefaultLesson(userId);

      // Create GenerationRequest
      const generationRequest = await this.prisma.generationRequest.create({
        data: {
          userId,
          type: 'game_generation',
          status: 'completed',
          params: dto as any,
          result: {
            gameId,
            url: gameUrl,
            downloadUrl,
            topic,
            type,
          },
          model: 'meta/llama-4-maverick-instruct',
        },
      });

      // Create UserGeneration
      const userGeneration = await this.prisma.userGeneration.create({
        data: {
          userId,
          generationType: 'game_generation',
          status: 'completed',
          inputParams: dto as any,
          outputData: {
            gameId,
            url: gameUrl,
            downloadUrl,
            topic,
            type,
          },
          model: 'meta/llama-4-maverick-instruct',
          generationRequestId: generationRequest.id,
          lessonId: defaultLesson.id,
        } as any,
      });
      userGenerationId = userGeneration.id;

      this.logger.log(`Saved game generation to DB for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to save game generation to DB: ${error.message}`, error.stack);
      // We don't throw here to avoid failing the request if DB save fails,
      // but in production you might want to handle this differently.
    }

    return {
      success: true,
      gameId,
      generationId: userGenerationId,
      url: gameUrl,
      downloadUrl,
    };
  }

  /**
   * Внедряет в HTML игры универсальный скрипт-мост, который сообщает
   * родительскому окну (странице ученика):
   *   - GAME_READY — игра загрузилась;
   *   - GAME_PROGRESS — промежуточный прогресс (раз в ~3 сек при изменении,
   *     плюс мгновенно при уходе со страницы) — чтобы результат сохранялся,
   *     даже если ученик не дошёл до финального экрана;
   *   - GAME_RESULT — финальный результат (MutationObserver на финальных
   *     экранах шаблонов, без правки логики каждой игры).
   *
   * Прогресс читается из top-level переменных шаблонов (score, moves,
   * matchesFound, viewedCount, currentQuestionIndex…) — они объявлены
   * `let/const` на верхнем уровне и видны из соседнего <script>.
   */
  private injectResultBridge(html: string, meta: { topic: string; type: string }): string {
    const metaJson = JSON.stringify({ topic: meta.topic || '', type: meta.type || '' });
    const bridge = `
<script>(function(){
  if (window.__prepodavaiBridgeV2) return;
  window.__prepodavaiBridgeV2 = true;
  // Старый мост (если вшит в файл при генерации) отключаем — иначе двойные сообщения.
  window.__prepodavaiBridge = true;
  var META = ${metaJson};
  try {
    if (typeof GAME_CONFIG === 'object' && GAME_CONFIG) {
      META = { topic: GAME_CONFIG.topic || META.topic, type: GAME_CONFIG.type || META.type };
    }
  } catch(e){}
  var sent = false;
  var lastProgressJson = '';
  function post(payload){
    try { window.parent && window.parent.postMessage(Object.assign({source:'prepodavai-game'}, payload), '*'); } catch(e){}
  }
  function sendFinal(payload){
    if (sent) return;
    sent = true;
    post(payload);
  }
  function txt(id){
    var el = document.getElementById(id);
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }
  function num(s){
    if (!s) return null;
    var m = String(s).replace(/\\s+/g,'').match(/-?\\d+(?:[.,]\\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  }
  function collect(outcome){
    // Известные id из встроенных шаблонов
    var score = num(txt('final-score'));
    var moves = num(txt('final-moves'));
    var time  = txt('final-time') || null;
    var winAmount  = num(txt('win-amount'));
    var loseAmount = num(txt('lose-amount'));
    var msg = txt('final-message') || txt('result-message') || '';
    var total = num(txt('final-total'));
    if (total == null){
      // Пытаемся достать total из текстов вида "5 / 10"
      var scoreBig = document.querySelector('.score-big');
      if (scoreBig){
        var m = (scoreBig.innerText || '').match(/\\/\\s*(\\d+)/);
        if (m) total = Number(m[1]);
      }
    }
    var live = progressSnapshot();
    sendFinal({
      type: 'GAME_RESULT',
      outcome: outcome || 'finished',
      topic: META.topic,
      gameType: META.type,
      score: score != null ? score : live.score,
      total: total != null ? total : live.total,
      moves: moves != null ? moves : live.moves,
      time: time || live.time,
      winAmount: winAmount,
      loseAmount: loseAmount,
      message: msg,
      finishedAt: new Date().toISOString()
    });
  }
  // Промежуточный прогресс: читаем живые top-level переменные шаблонов + DOM.
  // ВАЖНО: локальные имена не совпадают с игровыми (score/moves/…),
  // иначе локальное объявление затенит глобальное и typeof увидит локал.
  function progressSnapshot(){
    var s = null, tot = null, mv = null, tm = null;
    try { if (typeof matchesFound !== 'undefined') s = Number(matchesFound) || 0; } catch(e){}         // memory
    try { if (s == null && typeof viewedCount !== 'undefined') s = Number(viewedCount) || 0; } catch(e){} // flashcards
    try { if (s == null && typeof score !== 'undefined') s = Number(score) || 0; } catch(e){}             // truefalse
    try { if (s == null && typeof currentQuestionIndex !== 'undefined') s = Number(currentQuestionIndex) || 0; } catch(e){} // millionaire
    // crossword: решённые слова по DOM
    if (s == null && document.querySelector('.clue-item')){
      s = document.querySelectorAll('.clue-item.solved').length;
    }
    try {
      if (typeof RAW_PAIRS !== 'undefined' && Array.isArray(RAW_PAIRS)) tot = RAW_PAIRS.length;            // memory
      else if (typeof CARDS_DATA !== 'undefined' && Array.isArray(CARDS_DATA)) tot = CARDS_DATA.length;     // flashcards
      else if (typeof GAME_DATA !== 'undefined' && Array.isArray(GAME_DATA)) tot = GAME_DATA.length;        // truefalse / millionaire
      else if (typeof WORD_LIST !== 'undefined' && Array.isArray(WORD_LIST)) tot = WORD_LIST.length;        // crossword
    } catch(e){}
    try { if (typeof moves !== 'undefined') mv = Number(moves) || 0; } catch(e){}                          // memory
    var t = txt('timer');
    if (t) tm = t;
    return { score: s, total: tot, moves: mv, time: tm };
  }
  function reportProgress(force){
    if (sent) return;
    var p = progressSnapshot();
    // Репортим любое известное значение (0 — тоже результат: ученик
    // отвечал, но пока всё неверно). Полный «нуль во всём» — пока
    // рано, ждём первое взаимодействие.
    if (p.score == null && p.moves == null && !p.time) return;
    var json = JSON.stringify([p.score, p.total, p.moves]);
    if (!force && json === lastProgressJson) return;
    lastProgressJson = json;
    post({
      type: 'GAME_PROGRESS',
      outcome: 'in_progress',
      topic: META.topic,
      gameType: META.type,
      score: p.score,
      total: p.total,
      moves: p.moves,
      time: p.time,
      finishedAt: new Date().toISOString()
    });
  }
  function isVisible(el){
    if (!el) return false;
    var s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function check(){
    // Финальные контейнеры по разным шаблонам
    var candidates = [
      { sel: '#result-screen',  outcome: 'finished' }, // truefalse / flashcards
      { sel: '#win-modal.active', outcome: 'win'    }, // memory
      { sel: '#win-modal',      outcome: 'win'      }, // crossword/memory (style.display)
      { sel: '#screen-win',     outcome: 'win'      }, // millionaire
      { sel: '#screen-lose',    outcome: 'lose'     }, // millionaire
    ];
    for (var i=0; i<candidates.length; i++){
      var el = document.querySelector(candidates[i].sel);
      if (el && isVisible(el)){ collect(candidates[i].outcome); return true; }
    }
    return false;
  }
  function ready(){
    post({type:'GAME_READY', topic:META.topic, gameType:META.type});
    if (check()) return;
    var obs = new MutationObserver(function(){ if (check()) obs.disconnect(); });
    obs.observe(document.body, { attributes:true, childList:true, subtree:true, attributeFilter:['style','class'] });
    // Перестраховка — раз в секунду тоже проверяем (на случай скрытых от observer изменений)
    var iv = setInterval(function(){ if (check()) { clearInterval(iv); obs.disconnect(); clearInterval(pv); } }, 1000);
    // Прогресс — раз в 3 секунды при изменении
    var pv = setInterval(function(){ reportProgress(false); }, 3000);
    // При уходе/сворачивании страницы — шлём сразу
    window.addEventListener('pagehide', function(){ reportProgress(true); });
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') reportProgress(true); });
    setTimeout(function(){ clearInterval(iv); clearInterval(pv); obs.disconnect(); }, 30 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();</script>`;
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${bridge}\n</body>`);
    if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${bridge}\n</html>`);
    return html + bridge;
  }

  async getGameFile(gameId: string) {
    const filePath = path.join(this.gamesDir, `${gameId}.html`);
    try {
      await fs.access(filePath);
      let html = await fs.readFile(filePath, 'utf-8');
      // Мост внедряется и при отдаче файла: игры, сгенерированные до его
      // появления (или со старой версией), тоже должны репортить результат.
      if (!html.includes('__prepodavaiBridgeV2')) {
        // Старая версия моста могла быть уже вшита в файл. Она регистрирует
        // MutationObserver и слушателей до того, как новый мост успеет
        // выставить `window.__prepodavaiBridge = true`, поэтому просто
        // «глушить» её через флаг не выходит: дублируются GAME_RESULT-ы
        // и (что хуже) старый бридж выигрывает гонку, потому что не знает
        // про GAME_PROGRESS. Вырезаем его целиком.
        //
        // Negative-lookahead `(?!<\/script>)` не даёт `.*?` пересечь
        // границу </script> соседних скриптов — иначе regex удалит и
        // легитимный игровой скрипт вместе со старым мостом.
        html = html.replace(
          /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?__prepodavaiBridge(?:(?!<\/script>)[\s\S])*?<\/script>/gi,
          '',
        );
        html = this.injectResultBridge(html, { topic: '', type: '' });
      }
      return Buffer.from(html, 'utf-8');
    } catch (e) {
      throw new NotFoundException('Game not found');
    }
  }

  private getPrompt(
    type: GameType,
    topic: string,
    level?: string,
    count?: number,
    difficulty?: 'easy' | 'medium' | 'hard',
  ): string {
    const levelHint = level
      ? `Уровень — ${level} класс: подбирай сложность, формулировки и язык под этот возраст.`
      : '';
    const difficultyHint = difficulty
      ? `Общая сложность заданий: ${
          difficulty === 'easy'
            ? 'лёгкая — короткие, прямые вопросы по базовым понятиям.'
            : difficulty === 'hard'
              ? 'сложная — требующая глубокого понимания темы и анализа.'
              : 'средняя — баланс между базовыми и нетривиальными заданиями.'
        }`
      : '';
    const hints = [levelHint, difficultyHint].filter(Boolean).join('\n');
    const nMillionaire = clampCount(count ?? 15, 5, 30);
    const nFlash = clampCount(count ?? 12, 5, 30);
    const nMemory = clampCount(count ?? 8, 4, 16);
    const nCross = clampCount(count ?? 12, 5, 25);
    const nTF = clampCount(count ?? 15, 5, 30);
    switch (type) {
      case GameType.MILLIONAIRE:
        return `
Создай базу вопросов для игры "Кто хочет стать миллионером" на тему "${topic}".
Нужно ровно ${nMillionaire} вопросов разной сложности (от легких к сложным).
${hints}
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
Нужно ровно ${nFlash} карточек.
${hints}
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
Создай ${nMemory} пар карточек для игры "Найди пару" (Memory) на тему "${topic}".
Каждая пара — это два связанных понятия по теме (термин и определение, формула и её название, понятие и пример, и т.п.).
${hints}
Верни ТОЛЬКО валидный JSON массив из ${nMemory} объектов без лишнего текста и разметки.
Формат:
[
  { "id": 1, "card1": "...", "card2": "..." },
  { "id": 2, "card1": "...", "card2": "..." }
]
Пример для темы "Математика. Дискриминант":
[
  { "id": 1, "card1": "D = b² - 4ac", "card2": "Формула дискриминанта" },
  { "id": 2, "card1": "D > 0", "card2": "Два различных корня" }
]
Теперь создай ${nMemory} пар именно для темы "${topic}".
`;
      case GameType.CROSSWORD:
        return `
Создай список слов для кроссворда/филворда на тему "${topic}".
Нужно ровно ${nCross} слов с подсказками.
${hints}
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
Нужно ровно ${nTF} утверждений.
${hints}
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
      const rawContent = await this.replicateService.createCompletion(prompt, 'meta/llama-4-maverick-instruct', {
        max_tokens: 5000,
        temperature: 0.7,
      });
      this.logger.debug(`Raw AI response length: ${rawContent.length}`);

      // Clean up markdown code blocks if present
      const content = rawContent.replace(/```json\n?|\n?```/g, '').trim();

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
        this.logger.debug(
          `Successfully parsed JSON, type: ${Array.isArray(parsed) ? 'array' : 'object'}`,
        );
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
