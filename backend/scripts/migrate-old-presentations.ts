/**
 * Миграционный скрипт для старых презентаций (slideDoc → presentationData).
 *
 * Контекст:
 *   Раньше презентации сохранялись в outputData как { slideDoc: {...}, pdfUrl }.
 *   Новый pipeline пишет { content: html, presentationData, pdfUrl, pptxUrl }.
 *   Старый формат не открывается в новом MaterialViewer/PresentationV2.
 *
 * Что делает:
 *   1. Находит все UserGeneration с generationType='presentation' и старым форматом.
 *   2. Мапит slideDoc → presentationData (offline, БЕЗ LLM-вызовов — экономим токены).
 *   3. Перерендеривает HTML по новому шаблону, заново строит PDF и PPTX.
 *   4. Обновляет outputData. Старый slideDoc сохраняется в outputData.legacySlideDoc
 *      на случай отката.
 *
 * Запуск:
 *   cd backend
 *   npx ts-node scripts/migrate-old-presentations.ts          # dry-run, ничего не пишет
 *   npx ts-node scripts/migrate-old-presentations.ts --apply  # реально мигрирует
 *   npx ts-node scripts/migrate-old-presentations.ts --apply --limit=10  # ограничение
 *
 * Безопасно прерывать (Ctrl+C) — обрабатывает по одной записи, без транзакций.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { FilesService } from '../src/modules/files/files.service';
import { HtmlExportService } from '../src/common/services/html-export.service';
import { PresentationTemplateService, PresentationData, PresentationSlide, PresentationLayout, PresentationStyle, PresentationColor } from '../src/modules/generations/presentation/presentation-template.service';
import { PresentationPptxV2Service } from '../src/modules/generations/presentation/presentation-pptx-v2.service';

interface OldSlideDoc {
  topic?: string;
  audience?: string;
  themeId?: string;
  slides?: OldSlide[];
}
interface OldSlide {
  layout?: string;
  content?: {
    title?: string;
    subtitle?: string;
    eyebrow?: string;
    bullets?: string[];
    text?: string;
    leftTitle?: string;
    leftText?: string;
    rightTitle?: string;
    rightText?: string;
    question?: string;
    options?: string[];
    items?: string[];
    author?: string;
    paragraphs?: string[];
  };
  image?: any;
  speakerNotes?: string;
}

const OLD_LAYOUTS_TO_NEW: Record<string, PresentationLayout> = {
  title:        'title',
  agenda:       'bullets',
  bullets:      'bullets',
  'two-column': 'two-column',
  'image-text': 'content',
  quote:        'quote',
  quiz:         'bullets',
  summary:      'summary',
  content:      'content',
};

// Старые themeId → новые color-ключи
const THEME_TO_COLOR: Record<string, PresentationColor> = {
  indigo: 'indigo',
  emerald: 'emerald',
  violet: 'violet',
  blue: 'blue',
  slate: 'slate',
  // legacy/неизвестные → fallback на indigo
};

function migrateSlide(old: OldSlide): PresentationSlide {
  const oldLayout = (old?.layout || 'content').toLowerCase();
  const layout = OLD_LAYOUTS_TO_NEW[oldLayout] || 'content';
  const c = old?.content ?? {};

  const base: PresentationSlide = { layout };
  if (c.title)    base.title = c.title;
  if (c.subtitle) base.subtitle = c.subtitle;
  if (c.eyebrow)  base.eyebrow = c.eyebrow;
  if (c.author)   base.author = c.author;

  switch (layout) {
    case 'title':
      // Уже всё в base через title/subtitle/eyebrow
      break;

    case 'bullets': {
      // bullets / agenda → items
      const items = c.items ?? c.bullets ?? [];
      // Для quiz конвертируем вопрос+ответы в один item-блок
      if (oldLayout === 'quiz' && c.question) {
        base.title = base.title || c.question;
        base.items = (c.options ?? []).map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`);
      } else {
        base.items = items;
      }
      break;
    }

    case 'two-column':
      base.leftTitle  = c.leftTitle;
      base.leftText   = c.leftText;
      base.rightTitle = c.rightTitle;
      base.rightText  = c.rightText;
      break;

    case 'quote':
      base.text = c.text || c.title || '';
      base.author = c.author;
      // у quote title не нужен — основной контент в text
      delete base.title;
      break;

    case 'summary':
      base.items = c.items ?? c.bullets ?? [];
      break;

    case 'content':
    default: {
      // image-text/content → paragraphs
      if (c.paragraphs?.length) {
        base.paragraphs = c.paragraphs;
      } else if (c.text) {
        // Разбиваем длинный text на параграфы по \n\n
        base.paragraphs = c.text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
      } else if (c.bullets?.length) {
        base.paragraphs = c.bullets;
      } else {
        base.paragraphs = [];
      }
      break;
    }
  }

  return base;
}

function migrateSlideDoc(slideDoc: OldSlideDoc, style: PresentationStyle, color: PresentationColor): PresentationData {
  return {
    topic: slideDoc.topic || 'Презентация',
    audience: slideDoc.audience || 'Школьники',
    style,
    color,
    slides: (slideDoc.slides ?? []).map(migrateSlide),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
  const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;

  const logger = new Logger('migrate-old-presentations');
  logger.log(`Mode: ${APPLY ? 'APPLY (will modify DB)' : 'DRY-RUN (no changes)'}`);
  if (LIMIT) logger.log(`Limit: ${LIMIT}`);

  // Bootstrap минимальный context — без HTTP-сервера
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  const prisma = app.get(PrismaService);
  const filesService = app.get(FilesService);
  const htmlExport = app.get(HtmlExportService);
  const templateService = app.get(PresentationTemplateService);
  const pptxService = app.get(PresentationPptxV2Service);

  // Находим все презентации со старым форматом (есть slideDoc, нет content)
  const allPresentations = await prisma.userGeneration.findMany({
    where: {
      generationType: 'presentation',
      status: 'completed',
    },
    select: { id: true, userId: true, outputData: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  // Фильтруем те, у которых старый формат: есть slideDoc, нет content (нового HTML)
  const oldFormat = allPresentations.filter(p => {
    const out: any = p.outputData;
    if (!out) return false;
    const hasSlideDoc = !!out.slideDoc;
    const hasNewContent = typeof out.content === 'string' && out.content.includes('<html');
    return hasSlideDoc && !hasNewContent;
  });

  logger.log(`Found ${oldFormat.length} old-format presentations (of ${allPresentations.length} total)`);

  if (oldFormat.length === 0) {
    logger.log('Nothing to migrate. Done.');
    await app.close();
    return;
  }

  const toProcess = LIMIT ? oldFormat.slice(0, LIMIT) : oldFormat;
  let ok = 0, fail = 0, skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;
    const out: any = row.outputData ?? {};
    const slideDoc: OldSlideDoc = out.slideDoc;

    if (!slideDoc?.slides?.length) {
      logger.warn(`${progress} ${row.id}: slideDoc.slides пустой — skip`);
      skipped++;
      continue;
    }

    try {
      // Конвертируем
      const themeId = (slideDoc.themeId || 'indigo').toLowerCase();
      const color: PresentationColor = THEME_TO_COLOR[themeId] || 'indigo';
      const style: PresentationStyle = 'modern'; // дефолт для всех старых
      const data = migrateSlideDoc(slideDoc, style, color);

      logger.log(`${progress} ${row.id}: ${data.slides.length} slides, theme=${color}`);

      if (!APPLY) {
        // dry-run — только логируем
        ok++;
        continue;
      }

      // Рендер HTML по новому шаблону
      const html = await templateService.renderHtml(data);

      // PDF и PPTX (изолированно — если один упадёт, второй всё равно сохраним)
      let pdfUrl: string | undefined;
      let pptxUrl: string | undefined;

      try {
        const pdfBuffer = await htmlExport.htmlToPdf(html);
        const pdfFile = await filesService.saveBuffer(
          pdfBuffer,
          `presentation-${row.id}-migrated.pdf`,
          row.userId,
        );
        pdfUrl = pdfFile.url;
      } catch (e: any) {
        logger.warn(`${progress} PDF export failed: ${e?.message}`);
      }

      try {
        const pptxBuffer = await pptxService.build(data);
        const pptxFile = await filesService.saveBuffer(
          pptxBuffer,
          `presentation-${row.id}-migrated.pptx`,
          row.userId,
        );
        pptxUrl = pptxFile.url;
      } catch (e: any) {
        logger.warn(`${progress} PPTX export failed: ${e?.message}`);
      }

      // Собираем новый outputData. Старый slideDoc сохраняем как legacySlideDoc
      // на случай отката.
      const newOutputData = {
        ...out,
        provider: 'Migrated',
        mode: 'presentation',
        content: html,
        presentationData: data,
        slidesCount: data.slides.length,
        style: data.style,
        color: data.color,
        pdfUrl: pdfUrl ?? out.pdfUrl,
        pptxUrl: pptxUrl ?? out.pptxUrl,
        exportUrl: pdfUrl ?? out.exportUrl,
        legacySlideDoc: slideDoc, // backup на случай отката
        migratedAt: new Date().toISOString(),
        // Старое поле slideDoc удаляем — оно вызывало путаницу в новом коде
        slideDoc: undefined,
      };
      // Чистим undefined
      Object.keys(newOutputData).forEach(k => newOutputData[k] === undefined && delete newOutputData[k]);

      await prisma.userGeneration.update({
        where: { id: row.id },
        data: { outputData: newOutputData as any },
      });

      ok++;
    } catch (e: any) {
      logger.error(`${progress} ${row.id}: ${e?.message}`, e?.stack);
      fail++;
    }
  }

  logger.log('─────────────────────────────────');
  logger.log(`Total processed: ${toProcess.length}`);
  logger.log(`  ✅ Migrated:    ${ok}`);
  logger.log(`  ⚠️ Skipped:     ${skipped}`);
  logger.log(`  ❌ Failed:      ${fail}`);
  logger.log('─────────────────────────────────');
  if (!APPLY) {
    logger.log('DRY-RUN — никакие данные не изменены.');
    logger.log('Чтобы применить миграцию: npx ts-node scripts/migrate-old-presentations.ts --apply');
  }

  await app.close();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
