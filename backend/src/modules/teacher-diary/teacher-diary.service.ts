import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationsService } from '../generations/generations.service';

export interface DiaryEntryInput {
  date?: string | Date;
  classId?: string | null;
  studentId?: string | null;
  topic?: string | null;
  goals?: string | null;
  covered?: string | null;
  homework?: string | null;
  notes?: string | null;
  recordingUrl?: string | null;
}

const YANDEX_HOST_RE = /^https?:\/\/(disk\.yandex\.[a-z.]+|yadi\.sk)\//i;

@Injectable()
export class TeacherDiaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generationsService: GenerationsService,
  ) {}

  /**
   * Возвращает записи дневника учителя в обратном хронологическом порядке.
   * Для каждой записи с прикреплённым анализом подтягивает текущий статус
   * генерации одним батч-запросом, чтобы фронт показывал актуальный badge.
   */
  async listEntries(teacherId: string) {
    const entries = await this.prisma.teacherDiaryEntry.findMany({
      where: { teacherId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        class: { select: { id: true, name: true } },
        student: { select: { id: true, name: true } },
      },
    });

    const generationIds = entries
      .map((e) => e.analysisGenerationId)
      .filter((id): id is string => !!id);

    const generations = generationIds.length
      ? await this.prisma.userGeneration.findMany({
          where: { generationRequestId: { in: generationIds } },
          select: { generationRequestId: true, status: true, errorMessage: true },
        })
      : [];
    const genByRequestId = new Map(generations.map((g) => [g.generationRequestId, g]));

    return entries.map((e) => {
      const gen = e.analysisGenerationId ? genByRequestId.get(e.analysisGenerationId) : null;
      return {
        ...e,
        analysisStatus: gen?.status ?? null,
        analysisError: gen?.errorMessage ?? null,
      };
    });
  }

  async createEntry(teacherId: string, data: DiaryEntryInput) {
    if (data.recordingUrl) {
      this.assertYandexUrl(data.recordingUrl);
    }
    return this.prisma.teacherDiaryEntry.create({
      data: {
        teacherId,
        date: data.date ? new Date(data.date) : new Date(),
        classId: data.classId || null,
        studentId: data.studentId || null,
        topic: data.topic ?? null,
        goals: data.goals ?? null,
        covered: data.covered ?? null,
        homework: data.homework ?? null,
        notes: data.notes ?? null,
        recordingUrl: data.recordingUrl ?? null,
      },
    });
  }

  async updateEntry(teacherId: string, id: string, data: DiaryEntryInput) {
    await this.assertOwnership(teacherId, id);
    if (data.recordingUrl) {
      this.assertYandexUrl(data.recordingUrl);
    }
    return this.prisma.teacherDiaryEntry.update({
      where: { id },
      data: {
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
        ...(data.classId !== undefined ? { classId: data.classId || null } : {}),
        ...(data.studentId !== undefined ? { studentId: data.studentId || null } : {}),
        ...(data.topic !== undefined ? { topic: data.topic } : {}),
        ...(data.goals !== undefined ? { goals: data.goals } : {}),
        ...(data.covered !== undefined ? { covered: data.covered } : {}),
        ...(data.homework !== undefined ? { homework: data.homework } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.recordingUrl !== undefined ? { recordingUrl: data.recordingUrl } : {}),
      },
    });
  }

  async deleteEntry(teacherId: string, id: string) {
    await this.assertOwnership(teacherId, id);
    await this.prisma.teacherDiaryEntry.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Запускает методический видеоанализ для записи и привязывает
   * сгенерированный requestId к строке дневника.
   */
  async runAnalysis(teacherId: string, id: string) {
    const entry = await this.prisma.teacherDiaryEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Запись не найдена');
    if (entry.teacherId !== teacherId) throw new NotFoundException('Запись не найдена');
    if (!entry.recordingUrl) {
      throw new BadRequestException('Сначала прикрепи ссылку на запись с Яндекс.Диска');
    }
    this.assertYandexUrl(entry.recordingUrl);

    const result = await this.generationsService.createGeneration({
      userId: teacherId,
      generationType: 'video-analysis',
      inputParams: {
        fileUrl: entry.recordingUrl,
        analysisType: 'methodological',
        // Помечаем источник, чтобы processor после анализа дозаполнил
        // пустые поля дневника (тема/цели/что пройдено/ДЗ/заметки).
        diaryEntryId: id,
      },
    });

    if (!result?.requestId) {
      throw new BadRequestException('Не удалось запустить анализ');
    }

    await this.prisma.teacherDiaryEntry.update({
      where: { id },
      data: { analysisGenerationId: result.requestId },
    });

    return { ok: true, analysisGenerationId: result.requestId };
  }

  private async assertOwnership(teacherId: string, id: string) {
    const entry = await this.prisma.teacherDiaryEntry.findUnique({
      where: { id },
      select: { teacherId: true },
    });
    if (!entry || entry.teacherId !== teacherId) {
      throw new NotFoundException('Запись не найдена');
    }
  }

  private assertYandexUrl(url: string) {
    if (!YANDEX_HOST_RE.test(url.trim())) {
      throw new BadRequestException(
        'Ссылка должна быть с Яндекс.Диска (disk.yandex.ru или yadi.sk)',
      );
    }
  }
}
