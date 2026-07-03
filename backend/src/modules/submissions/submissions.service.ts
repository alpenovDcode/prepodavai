import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReplicateService } from '../replicate/replicate.service';
import { ReferralsService } from '../referrals/referrals.service';
import { EmailService } from '../../common/services/email.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private replicateService: ReplicateService,
    private referralsService: ReferralsService,
    private emailService: EmailService,
    private gamificationService: GamificationService,
  ) {}

  async createSubmission(
    studentId: string,
    data: {
      assignmentId: string;
      content?: string;
      fileUrl?: string;
      attachments?: any[];
      formData?: any;
    },
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: data.assignmentId },
      include: {
        student: true,
        class: { include: { students: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Check if student is allowed to submit
    const isDirectlyAssigned = assignment.studentId === studentId;
    const isClassAssigned =
      assignment.classId && assignment.class?.students.some((s) => s.id === studentId);

    if (!isDirectlyAssigned && !isClassAssigned) {
      throw new ForbiddenException('You are not assigned to this task');
    }

    // Check for existing submission (prevent duplicates, allow editing)
    const existingSubmission = await this.prisma.submission.findFirst({
      where: { assignmentId: data.assignmentId, studentId },
    });

    if (existingSubmission) {
      if (existingSubmission.grade !== null) {
        throw new BadRequestException('Работа уже проверена учителем. Редактирование недоступно.');
      }
      return this._updateSubmissionData(existingSubmission.id, data);
    }

    const attachmentsPayload = this._buildAttachments(data);

    const submission = await this.prisma.submission.create({
      data: {
        assignmentId: data.assignmentId,
        studentId,
        content: data.content || null,
        attachments: attachmentsPayload,
        formData: this._sanitizeFormData(data.formData),
        status: 'submitted',
      },
      include: { student: true },
    });

    await this.prisma.assignment.update({
      where: { id: data.assignmentId },
      data: { status: 'submitted' },
    });

    await this._notifyTeacherOnSubmission(assignment, submission);

    // Реферальная система: отслеживаем сдачу заданий учеником
    this.referralsService.onStudentSubmission(studentId).catch(() => {});

    // Геймификация: +XP за сдачу, инкремент счётчика, проверка ачивок.
    // Изолирован catch — не валим основной поток если gamification сбоит.
    this.gamificationService
      .onSubmissionCreated(studentId, submission.id)
      .catch((e) => this.logger.warn(`gamification.onSubmissionCreated failed: ${e?.message}`));

    return submission;
  }

  async updateSubmission(
    studentId: string,
    submissionId: string,
    data: { content?: string; attachments?: any[]; formData?: any },
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.studentId !== studentId) throw new ForbiddenException('Access denied');
    if (submission.grade !== null) {
      throw new BadRequestException('Работа уже проверена учителем. Редактирование недоступно.');
    }

    return this._updateSubmissionData(submissionId, data);
  }

  /**
   * Приводит formData к безопасному виду. Служебный ключ `_game`
   * валидируется по схеме (числа — числа, строки — строки, лишние поля
   * выкидываются). Обычные поля — примитивы, а также ОДИН уровень
   * вложенности для ответов V2-блоков (json-blocks-v1):
   *   fill-blank → { "1": "ответ" }, matching → { leftId: rightId },
   *   multiple-choice с multiple:true → ["a", "c"].
   * Раньше объекты/массивы молча выбрасывались — ответы ученика по этим
   * блокам не доходили до БД, и учитель видел пустую работу.
   */
  private _sanitizeFormData(input: any): any {
    if (!input || typeof input !== 'object') return null;
    const isPrimitive = (v: any) =>
      v === null || ['string', 'number', 'boolean'].includes(typeof v);
    const cleanPrimitive = (v: any) => (typeof v === 'string' ? v.slice(0, 10_000) : v);
    const sanitizeGame = (g: any) => {
      if (!g || typeof g !== 'object') return null;
      const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const str = (v: any, max = 200) =>
        typeof v === 'string' ? v.slice(0, max) : undefined;
      // 'in_progress' — промежуточный результат: игра начата, но не завершена.
      const outcome = ['win', 'lose', 'finished', 'in_progress'].includes(g.outcome)
        ? g.outcome
        : undefined;
      return {
        outcome,
        score: num(g.score),
        total: num(g.total),
        moves: num(g.moves),
        time: str(g.time, 40),
        winAmount: num(g.winAmount),
        loseAmount: num(g.loseAmount),
        message: str(g.message, 500),
        gameType: str(g.gameType, 40),
        topic: str(g.topic, 200),
        finishedAt: str(g.finishedAt, 40),
      };
    };
    // Ответ V2-блока: массив примитивов или плоский объект с примитивами.
    const sanitizeNested = (v: any): any | undefined => {
      if (Array.isArray(v)) {
        const arr = v.filter(isPrimitive).slice(0, 200).map(cleanPrimitive);
        return arr.length ? arr : undefined;
      }
      if (v && typeof v === 'object') {
        const obj: Record<string, any> = {};
        for (const [k, val] of Object.entries(v).slice(0, 200)) {
          if (!isPrimitive(val)) continue;
          if (typeof val === 'string' && val.trim() === '') continue;
          obj[k.slice(0, 100)] = cleanPrimitive(val);
        }
        return Object.keys(obj).length ? obj : undefined;
      }
      return undefined;
    };
    const out: Record<string, Record<string, any>> = {};
    for (const [genId, fields] of Object.entries(input as Record<string, any>)) {
      if (!fields || typeof fields !== 'object') continue;
      const cleanFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields as Record<string, any>)) {
        if (k === '_game') {
          const game = sanitizeGame(v);
          if (game) cleanFields._game = game;
        } else if (isPrimitive(v)) {
          // Пустые строки не сохраняем: интерактивный лист шлёт ВСЕ поля,
          // включая незаполненные. formData при апдейте заменяется целиком,
          // так что «очистку» поля это не теряет.
          if (typeof v === 'string' && v.trim() === '') continue;
          // Ограничиваем длину строк, чтобы не складировать гигабайты в JSON
          cleanFields[k] = cleanPrimitive(v);
        } else {
          const nested = sanitizeNested(v);
          if (nested !== undefined) cleanFields[k] = nested;
        }
      }
      if (Object.keys(cleanFields).length) out[genId] = cleanFields;
    }
    return Object.keys(out).length ? out : null;
  }

  private _buildAttachments(data: { fileUrl?: string; attachments?: any[] }) {
    if (data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
      return data.attachments;
    }
    if (data.fileUrl) {
      return [{ url: data.fileUrl, type: 'file' }];
    }
    return null;
  }

  private async _updateSubmissionData(
    submissionId: string,
    data: { content?: string; fileUrl?: string; attachments?: any[]; formData?: any },
  ) {
    const attachmentsPayload = this._buildAttachments(data);

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        content: data.content !== undefined ? data.content || null : undefined,
        ...(attachmentsPayload !== null ? { attachments: attachmentsPayload } : {}),
        ...(data.formData !== undefined ? { formData: this._sanitizeFormData(data.formData) } : {}),
        status: 'submitted',
        updatedAt: new Date(),
      },
    });
  }

  async gradeSubmission(
    teacherId: string,
    submissionId: string,
    data: { grade: number; feedback?: string },
  ) {
    if (data.grade < 1 || data.grade > 5) {
      throw new BadRequestException('Grade must be between 1 and 5');
    }

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            class: true,
            student: { include: { class: true } },
            lesson: { select: { title: true } },
          },
        },
        student: true,
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    const teacherIdOfClass =
      submission.assignment.class?.teacherId ||
      submission.assignment.student?.class?.teacherId;

    if (teacherIdOfClass !== teacherId) throw new ForbiddenException('Access denied');

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        grade: data.grade,
        feedback: data.feedback || null,
        status: 'graded',
      },
      include: {
        student: { select: { id: true, name: true } },
      },
    });

    await this._syncAssignmentStatus(submission.assignmentId);

    await this.notificationsService.createNotification({
      userId: submission.studentId,
      userType: 'student',
      type: 'submission_graded',
      title: 'Работа проверена!',
      message: `Учитель проверил вашу работу "${submission.assignment.lesson.title}" и поставил оценку ${data.grade}.`,
      metadata: {
        assignmentId: submission.assignmentId,
        submissionId: submission.id,
        grade: data.grade,
        lessonTitle: submission.assignment.lesson.title,
      },
    });

    const teacher = await this.prisma.appUser.findUnique({
      where: { id: teacherId },
      select: { notifyWeeklyReport: true },
    });
    const studentEmail = submission.student?.email?.trim();
    if (teacher?.notifyWeeklyReport && studentEmail) {
      this.emailService
        .sendHomeworkGradedEmail(studentEmail, {
          studentName: submission.student?.name || 'ученик',
          lessonTitle: submission.assignment.lesson.title,
          grade: data.grade,
          feedback: data.feedback || null,
          assignmentId: submission.assignmentId,
        })
        .catch((err) =>
          this.logger.warn(`Failed to send homework-graded email to ${studentEmail}: ${err?.message}`),
        );
    }

    // Геймификация: +XP за оценку, инкремент grad ed/perfect, проверка ачивок.
    this.gamificationService
      .onSubmissionGraded(submission.studentId, submission.id, data.grade)
      .catch((e) => this.logger.warn(`gamification.onSubmissionGraded failed: ${e?.message}`));

    return updated;
  }

  private async _syncAssignmentStatus(assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        class: { include: { students: true } },
        submissions: true,
      },
    });
    if (!assignment) return;

    const students =
      assignment.class?.students || (assignment.studentId ? [{ id: assignment.studentId }] : []);
    const gradedIds = new Set(
      assignment.submissions.filter((s) => s.grade !== null).map((s) => s.studentId),
    );
    const allGraded = students.length > 0 && students.every((s) => gradedIds.has(s.id));

    if (allGraded) {
      await this.prisma.assignment.update({
        where: { id: assignmentId },
        data: { status: 'graded' },
      });
    }
  }

  private async _notifyTeacherOnSubmission(assignment: any, submission: any) {
    const teacherId =
      assignment.class?.teacherId || assignment.student?.class?.teacherId;
    if (!teacherId) return;

    const studentName = submission.student?.name || 'Ученик';
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: assignment.lessonId },
      select: { title: true },
    });
    const lessonTitle = lesson?.title || 'задание';

    await this.notificationsService.createNotification({
      userId: teacherId,
      userType: 'teacher',
      type: 'submission_received',
      title: 'Новая работа на проверку',
      message: `${studentName} сдал(а) работу "${lessonTitle}".`,
      metadata: {
        assignmentId: assignment.id,
        submissionId: submission.id,
        studentName,
        lessonTitle,
      },
    });

    const teacher = await this.prisma.appUser.findUnique({
      where: { id: teacherId },
      select: { email: true, firstName: true, notifyStudentProgress: true, telegramChatId: true, maxChatId: true },
    });
    const teacherEmail = teacher?.email?.trim();
    // Шлём письмо при сдаче работы только если учитель явно включил «Ученик сдал работу»
    // в настройках уведомлений (Settings → notifyStudentProgress).
    if (teacher?.notifyStudentProgress && teacherEmail) {
      this.emailService
        .sendHomeworkSubmittedEmail(teacherEmail, {
          teacherName: teacher.firstName || null,
          studentName,
          lessonTitle,
          assignmentId: assignment.id,
        })
        .catch((err) =>
          this.logger.warn(`Failed to send homework-submitted email to ${teacherEmail}: ${err?.message}`),
        );
    }

    // Уведомление в Telegram-бот (fire-and-forget)
    const botNotifyUrl = process.env.BOT_NOTIFY_URL;
    const botNotifySecret = process.env.BOT_NOTIFY_SECRET || '';
    if (botNotifyUrl && teacher?.telegramChatId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://prepodavai.ru';
      fetch(`${botNotifyUrl}/notify/submission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(botNotifySecret ? { 'x-bot-secret': botNotifySecret } : {}),
        },
        body: JSON.stringify({
          telegramChatId: teacher.telegramChatId,
          studentName,
          lessonTitle,
          assignmentId: assignment.id,
          studentId: submission.student?.id,
          appUrl,
        }),
      }).catch((err) =>
        this.logger.warn(`[TG notify] Failed to notify bot: ${err?.message}`),
      );
    }

    // Уведомление в MAX-бот (fire-and-forget)
    const maxChatId = (teacher as any)?.maxChatId;
    const maxToken = process.env.MAX_BOT_TOKEN;
    const maxApiUrl = (process.env.MAX_API_URL || 'https://platform-api.max.ru').replace(/\/$/, '');
    if (maxChatId && maxToken) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://prepodavai.ru';
      const msgText = `📥 Ученик ${studentName} сдал(а) работу по теме «${lessonTitle}»`;
      const attachment = {
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'link', text: '👀 Посмотреть', url: `${appUrl}/dashboard/students/${submission.student?.id}` }]],
        },
      };
      fetch(`${maxApiUrl}/messages?user_id=${maxChatId}`, {
        method: 'POST',
        headers: { Authorization: maxToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msgText, attachments: [attachment] }),
      }).catch((err) =>
        this.logger.warn(`[MAX notify] Failed to notify MAX bot: ${err?.message}`),
      );
    }
  }

  async getSubmissionsForAssignment(teacherId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        class: { include: { students: { orderBy: { name: 'asc' } } } },
        student: { include: { class: true } },
        lesson: {
          include: {
            // Return ALL generations (no limit) so teacher can replay interactive HTML
            generations: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });

    if (!assignment) throw new NotFoundException('Assignment not found');

    const ownerId = assignment.class?.teacherId || assignment.student?.class?.teacherId;
    if (ownerId !== teacherId) throw new ForbiddenException('Access denied');

    const submissions = await this.prisma.submission.findMany({
      where: { assignmentId },
      include: {
        student: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const studentsInClass =
      assignment.class?.students || (assignment.student ? [assignment.student] : []);

    const studentStatuses = studentsInClass.map((student) => {
      const studentSubmissions = submissions.filter((s) => s.studentId === student.id);
      const latestSubmission = studentSubmissions[0] || null;

      return {
        student: { id: student.id, name: student.name, avatar: (student as any).avatar },
        submission: latestSubmission,
        status: latestSubmission
          ? latestSubmission.grade !== null
            ? 'graded'
            : 'submitted'
          : 'pending',
        isLate: !!(latestSubmission && assignment.dueDate && latestSubmission.createdAt > assignment.dueDate),
      };
    });

    // Extract first generation content for task display
    let assignmentContent: string | null = null;
    if (assignment.lesson?.generations?.length > 0) {
      const gen = assignment.lesson.generations[0];
      const outputData = gen.outputData as any;
      assignmentContent = outputData?.content || outputData?.html || outputData?.text || null;
    }

    const gradedStatuses = studentStatuses.filter((s) => s.status === 'graded');
    const avgGrade =
      gradedStatuses.length > 0
        ? Math.round(
            (gradedStatuses.reduce((sum, s) => sum + (s.submission?.grade || 0), 0) /
              gradedStatuses.length) *
              10,
          ) / 10
        : null;

    return {
      assignment: {
        id: assignment.id,
        dueDate: assignment.dueDate,
        title: assignment.lesson.title,
        content: assignmentContent,
        // All generations with their full outputData for HTML replay
        generations: assignment.lesson.generations.map((g) => ({
          id: g.id,
          type: g.generationType,
          outputData: g.outputData,
        })),
      },
      studentStatuses,
      totalStudents: studentsInClass.length,
      submittedCount: studentStatuses.filter((s) => s.status !== 'pending').length,
      gradedCount: studentStatuses.filter((s) => s.status === 'graded').length,
      notSubmittedCount: studentStatuses.filter((s) => s.status === 'pending').length,
      avgGrade,
    };
  }

  async getMySubmissions(studentId: string) {
    return this.prisma.submission.findMany({
      where: { studentId },
      include: {
        assignment: {
          include: {
            lesson: { select: { title: true, topic: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateAiFeedback(
    teacherId: string,
    submissionId: string,
  ): Promise<{ feedback: string; grade: number | null }> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            class: true,
            student: { include: { class: true } },
            lesson: {
              select: {
                title: true,
                topic: true,
                generations: {
                  select: { id: true, generationType: true, outputData: true },
                  orderBy: { createdAt: 'desc' as const },
                },
              },
            },
          },
        },
        student: { select: { name: true } },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    const teacherIdOfClass =
      submission.assignment.class?.teacherId ||
      submission.assignment.student?.class?.teacherId;
    if (teacherIdOfClass !== teacherId) throw new ForbiddenException('Access denied');

    // Загруженные пользователем материалы (PDF/JPG/PNG) AI не проверяет —
    // text-only модель не видит ни файл учителя, ни фото ученика, оценка
    // была бы наугад. Если в задании ТОЛЬКО такие материалы — возвращаем
    // понятный отказ без обращения к LLM.
    const generationsForCheck = submission.assignment.lesson.generations || [];
    const onlyUploadedFiles =
      generationsForCheck.length > 0 &&
      generationsForCheck.every(
        g => g.generationType === 'uploaded_file' || g.generationType === 'uploadedFile',
      );
    if (onlyUploadedFiles) {
      return {
        feedback:
          'AI-проверка не применяется к загруженным материалам — оцените работу вручную.',
        grade: null,
      };
    }

    const lessonTitle = submission.assignment.lesson.title;
    const lessonTopic = submission.assignment.lesson.topic || '';
    const studentName = submission.student?.name || 'Ученик';
    // Ограничиваем объём данных, уходящих в LLM, чтобы не зависнуть на Replicate.
    const MAX_ANSWER_CHARS = 20000;
    const MAX_FORM_CHARS = 10000;
    const MAX_TASK_CHARS = 20000;
    const textAnswer = (submission.content || '').slice(0, MAX_ANSWER_CHARS);
    const rawFormData = (submission as any).formData;
    const formData = rawFormData
      ? JSON.stringify(rawFormData, null, 2).slice(0, MAX_FORM_CHARS)
      : '';

    // Extract task content and answer keys from generations
    const generations = submission.assignment.lesson.generations || [];
    let taskContent = '';
    // Автосверка ответов для V2-генераций (json-blocks-v1): точные счётчики
    // «верно/неверно», чтобы LLM не гадала по сырым blockId-ключам.
    const autoCheck = { correct: 0, wrong: 0, unanswered: 0, manual: 0, hasV2: false };
    for (const gen of generations) {
      if (taskContent.length >= MAX_TASK_CHARS) break;
      const output = gen.outputData as any;
      if (!output) continue;
      let text = '';
      if (typeof output === 'string') {
        text = output;
      } else if (output.format === 'json-blocks-v1' && output.outputDoc) {
        // V2: структурированный документ. Разворачиваем блоки в читаемый
        // разбор «вопрос → правильный ответ → ответ ученика → вердикт».
        const genAnswers = (rawFormData as any)?.[gen.id] || {};
        const described = this._describeJsonBlocksForAi(output.outputDoc, genAnswers);
        if (described) {
          text = described.text;
          autoCheck.correct += described.correct;
          autoCheck.wrong += described.wrong;
          autoCheck.unanswered += described.unanswered;
          autoCheck.manual += described.manual;
          autoCheck.hasV2 = true;
        }
      } else {
        // Legacy: try all known outputData fields
        const raw = output.content || output.htmlResult || output.html || output.text || '';
        if (typeof raw === 'string' && raw.trim()) {
          // Strip HTML tags to get plain text for prompt
          text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
      if (text) {
        taskContent += `\n[${gen.generationType}]:\n${text}\n`;
      }
    }
    if (taskContent.length > MAX_TASK_CHARS) {
      taskContent = taskContent.slice(0, MAX_TASK_CHARS);
    }
    const autoCheckSummary = autoCheck.hasV2
      ? `\nАВТОМАТИЧЕСКАЯ СВЕРКА ОТВЕТОВ (доверяй ей, не пересчитывай сам): верно — ${autoCheck.correct}, неверно — ${autoCheck.wrong}, без ответа — ${autoCheck.unanswered}${autoCheck.manual ? `, требуют ручной оценки (открытые вопросы) — ${autoCheck.manual}` : ''}.`
      : '';
    // Итоги мини-игр — короткой строкой (для V2-пути, где сырой JSON не шлём).
    const gameSummary = autoCheck.hasV2 ? this._describeGamesForAi(rawFormData) : '';

    const prompt = `Ты — опытный и доброжелательный учитель, проверяющий работу ученика.

Тема задания: ${lessonTitle}${lessonTopic ? ` (${lessonTopic})` : ''}
Ученик: ${studentName}
${taskContent ? `\nСодержание задания (включая правильные ответы, если есть):\n${taskContent}` : ''}
Ответ ученика:
${textAnswer || '(текстовый ответ отсутствует)'}${autoCheckSummary}${formData && !autoCheck.hasV2 ? `\n\nЗаполненные поля задания (JSON):\n${formData}\n\nПримечание: внутри JSON поле «_game» — это итог пройденной учеником мини-игры (поля: outcome — finished/win/lose/in_progress; score, total — счёт; moves — число ходов; time — затраченное время; winAmount — выигрыш; message — итоговое сообщение игры). Учитывай это при оценке: высокий процент правильных ответов или победа = высокая оценка; in_progress — игра начата, но не завершена.` : ''}${gameSummary ? `\n\nМини-игры (итоги): ${gameSummary}` : ''}

Проверь работу ученика, сравнив его ответы с правильными ответами из задания. Верни ТОЛЬКО валидный JSON без пояснений, без markdown-обёртки, без комментариев до или после. Формат строго такой:
{"grade": <целое число от 1 до 5>, "feedback": "<краткий, конструктивный и поддерживающий комментарий 3–5 предложений на русском языке. Укажи количество правильных и неправильных ответов, отметь что сделано хорошо, и если есть ошибки — мягко укажи на них с пояснением правильного ответа. Связный текст без заголовков и маркеров.>"}

Шкала оценки:
- 5 — всё правильно или 1 мелкая неточность
- 4 — в целом верно, но есть 1–2 ошибки
- 3 — половина работы выполнена верно
- 2 — больше ошибок, чем правильных ответов
- 1 — работа практически не выполнена или все ответы неверные`;

    const raw = await this.replicateService.createCompletion(
      prompt,
      'meta/llama-4-maverick-instruct',
      { max_tokens: 10000, temperature: 0.5 },
    );

    return this._parseAiDraft(raw);
  }

  /**
   * Разворачивает V2-документ (json-blocks-v1) + ответы ученика в читаемый
   * для LLM разбор и заодно детерминированно сверяет закрытые вопросы.
   * blockId-ключи из formData сопоставляются с блоками документа, поэтому
   * модель видит «вопрос → правильный ответ → ответ ученика → вердикт»,
   * а не бессмысленные пары типа "mc-3": "b".
   */
  private _describeJsonBlocksForAi(
    doc: any,
    genAnswers: Record<string, any>,
  ): { text: string; correct: number; wrong: number; unanswered: number; manual: number } | null {
    if (!doc || !Array.isArray(doc.blocks)) return null;
    const norm = (s: any) =>
      String(s ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/,/g, '.')
        .replace(/[.!?;:]+$/g, '');
    const lines: string[] = [];
    if (doc.title) lines.push(`Название: ${doc.title}`);
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    let manual = 0;
    let qNum = 0;

    for (const block of doc.blocks) {
      if (!block || typeof block !== 'object') continue;
      const answer = genAnswers?.[block.id];

      if (block.type === 'multiple-choice') {
        qNum++;
        const options: any[] = Array.isArray(block.options) ? block.options : [];
        const correctIds = options.filter((o) => o?.correct).map((o) => String(o.id));
        const optText = (id: any) =>
          options.find((o) => String(o?.id) === String(id))?.text ?? String(id);
        const selected: string[] = Array.isArray(answer)
          ? answer.map(String)
          : answer != null && answer !== ''
            ? [String(answer)]
            : [];
        lines.push(`Вопрос ${qNum}: ${block.question}`);
        lines.push(`  Варианты: ${options.map((o) => `${o.id}) ${o.text}`).join('; ')}`);
        lines.push(`  Правильный ответ: ${correctIds.map(optText).join('; ') || '—'}`);
        if (selected.length === 0) {
          unanswered++;
          lines.push('  Ответ ученика: (нет ответа)');
        } else {
          const ok =
            selected.length === correctIds.length &&
            selected.every((s) => correctIds.includes(s));
          if (ok) correct++; else wrong++;
          lines.push(`  Ответ ученика: ${selected.map(optText).join('; ')} → ${ok ? 'ВЕРНО' : 'НЕВЕРНО'}`);
        }
      } else if (block.type === 'fill-blank') {
        qNum++;
        const blanks: any[] = Array.isArray(block.blanks) ? block.blanks : [];
        lines.push(`Вопрос ${qNum} (заполнить пропуски): ${block.template}`);
        for (const b of blanks) {
          const student = answer && typeof answer === 'object' ? answer[b.index] : undefined;
          if (student == null || String(student).trim() === '') {
            unanswered++;
            lines.push(`  Пропуск ${b.index}: правильно «${b.answer}», ученик — (пусто)`);
          } else {
            const ok = norm(student) === norm(b.answer);
            if (ok) correct++; else wrong++;
            lines.push(`  Пропуск ${b.index}: правильно «${b.answer}», ученик — «${student}» → ${ok ? 'ВЕРНО' : 'НЕВЕРНО'}`);
          }
        }
      } else if (block.type === 'short-answer') {
        qNum++;
        lines.push(`Вопрос ${qNum} (открытый): ${block.question}`);
        if (block.expectedAnswer) lines.push(`  Ожидаемый ответ: ${block.expectedAnswer}`);
        const student = typeof answer === 'string' ? answer : '';
        if (!student.trim()) {
          unanswered++;
          lines.push('  Ответ ученика: (нет ответа)');
        } else if (block.expectedAnswer && norm(student) === norm(block.expectedAnswer)) {
          correct++;
          lines.push(`  Ответ ученика: «${student}» → ВЕРНО`);
        } else {
          // Открытый вопрос: точного совпадения нет — пусть модель оценит сама.
          manual++;
          lines.push(`  Ответ ученика: «${student}» → оцени сам (свободная формулировка)`);
        }
      } else if (block.type === 'matching') {
        qNum++;
        const pairs: [string, string][] = Array.isArray(block.pairs) ? block.pairs : [];
        const leftText = (id: any) =>
          (Array.isArray(block.left) ? block.left : []).find((l: any) => String(l?.id) === String(id))?.text ?? String(id);
        const rightText = (id: any) =>
          (Array.isArray(block.right) ? block.right : []).find((r: any) => String(r?.id) === String(id))?.text ?? String(id);
        lines.push(`Вопрос ${qNum} (соответствия): ${block.instruction}`);
        const studentMap = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
        for (const [l, r] of pairs) {
          const student = (studentMap as any)[l];
          if (student == null || student === '') {
            unanswered++;
            lines.push(`  «${leftText(l)}» → правильно «${rightText(r)}», ученик — (пусто)`);
          } else {
            const ok = String(student) === String(r);
            if (ok) correct++; else wrong++;
            lines.push(`  «${leftText(l)}» → правильно «${rightText(r)}», ученик — «${rightText(student)}» → ${ok ? 'ВЕРНО' : 'НЕВЕРНО'}`);
          }
        }
      } else if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'callout') {
        // Контекст задания — компактно, чтобы модель понимала тему.
        const t = block.text || '';
        if (t && t.length < 300) lines.push(String(t));
      }
    }

    if (qNum === 0) return null;
    const MAX = 12_000;
    let text = lines.join('\n');
    if (text.length > MAX) text = text.slice(0, MAX);
    return { text, correct, wrong, unanswered, manual };
  }

  /** Короткая строка с итогами мини-игр из formData (ключи `_game`). */
  private _describeGamesForAi(rawFormData: any): string {
    if (!rawFormData || typeof rawFormData !== 'object') return '';
    const parts: string[] = [];
    for (const fields of Object.values(rawFormData as Record<string, any>)) {
      const g = (fields as any)?._game;
      if (!g || typeof g !== 'object') continue;
      const outcome =
        g.outcome === 'win' ? 'победа'
        : g.outcome === 'lose' ? 'поражение'
        : g.outcome === 'in_progress' ? 'не завершена'
        : 'пройдена';
      const score = typeof g.score === 'number'
        ? ` счёт ${g.score}${typeof g.total === 'number' ? `/${g.total}` : ''}`
        : '';
      parts.push(`${g.gameType || 'игра'} (${g.topic || 'без темы'}): ${outcome}${score}`);
    }
    return parts.join('; ');
  }

  private _parseAiDraft(raw: string): { feedback: string; grade: number | null } {
    const text = (raw || '').trim();
    if (!text) return { feedback: '', grade: null };

    // Try to find a JSON object in the response (handles possible ```json ... ``` wrappers)
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const gradeRaw = parsed.grade;
        const grade =
          typeof gradeRaw === 'number' && gradeRaw >= 1 && gradeRaw <= 5
            ? Math.round(gradeRaw)
            : null;
        const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '';
        if (feedback) return { feedback, grade };
      } catch {
        // fall through to raw-text fallback
      }
    }

    // Fallback: treat entire output as feedback, no grade
    return { feedback: text, grade: null };
  }

  /**
   * Лента «Проверка» для V2: список submissions учителя с фильтрами/сортировкой.
   * status: 'pending' — сданные, но без оценки; 'done' — проверенные.
   */
  async getQueue(
    teacherId: string,
    opts: {
      status: 'pending' | 'done';
      classId: string | null;
      type: string | null;
      search: string | null;
      sort: 'urgent' | 'overdue' | 'new' | 'name' | 'class';
    },
  ) {
    const submissions = await this.prisma.submission.findMany({
      where: {
        assignment: {
          OR: [
            { class: { teacherId } },
            { student: { class: { teacherId } } },
          ],
          ...(opts.classId ? { classId: opts.classId } : {}),
        },
        ...(opts.status === 'pending' ? { grade: null } : { grade: { not: null } }),
      },
      include: {
        student: { select: { id: true, name: true, avatar: true, class: { select: { id: true, name: true } } } },
        assignment: {
          include: {
            class: { select: { id: true, name: true } },
            lesson: { select: { title: true, topic: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const filtered = submissions.filter((s) => {
      if (opts.search) {
        const q = opts.search.toLowerCase();
        const hay = `${s.student?.name || ''} ${s.assignment?.lesson?.title || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const now = Date.now();
    const items = filtered.map((s) => {
      const due = s.assignment?.dueDate ? new Date(s.assignment.dueDate).getTime() : null;
      const isOverdue = !!(due && due < now && s.grade === null);
      return {
        id: s.id,
        createdAt: s.createdAt,
        grade: s.grade,
        student: s.student
          ? {
              id: s.student.id,
              name: s.student.name,
              avatar: s.student.avatar,
              className: s.student.class?.name || s.assignment?.class?.name || null,
            }
          : null,
        assignment: {
          id: s.assignmentId,
          title: s.assignment?.lesson?.title || 'Без названия',
          topic: s.assignment?.lesson?.topic || null,
          dueDate: s.assignment?.dueDate,
          className: s.assignment?.class?.name || null,
        },
        isOverdue,
      };
    });

    items.sort((a, b) => {
      switch (opts.sort) {
        case 'overdue':
          return (b.isOverdue ? 1 : 0) - (a.isOverdue ? 1 : 0);
        case 'name':
          return (a.student?.name || '').localeCompare(b.student?.name || '');
        case 'class':
          return (a.assignment.className || '').localeCompare(b.assignment.className || '');
        case 'new':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'urgent':
        default: {
          const ad = a.assignment.dueDate ? new Date(a.assignment.dueDate).getTime() : Infinity;
          const bd = b.assignment.dueDate ? new Date(b.assignment.dueDate).getTime() : Infinity;
          return ad - bd;
        }
      }
    });

    return { items, total: items.length };
  }

  /**
   * Готовые шаблоны фидбэка для V2-страницы /dashboard/grading/[id].
   * Возвращаем статикой — не хранится в БД.
   */
  getFeedbackTemplates() {
    return {
      templates: [
        { id: 'great', label: 'Отлично', text: 'Великолепная работа! Все ответы верны, видна вдумчивая работа над темой.' },
        { id: 'good', label: 'Хорошо', text: 'Хороший результат. Несколько мелких ошибок — обрати внимание на разбор.' },
        { id: 'mixed', label: 'Есть над чем поработать', text: 'Часть ответов верна, но есть пробелы. Повтори материал и попробуй ещё раз.' },
        { id: 'redo', label: 'Нужна доработка', text: 'Большинство ответов неверные. Давай разберём ошибки вместе на следующем уроке.' },
      ],
    };
  }

  /**
   * Детальная карточка работы для V2 /dashboard/grading/[id].
   */
  async getSubmissionDetail(teacherId: string, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        student: { select: { id: true, name: true, avatar: true, email: true, class: { select: { id: true, name: true } } } },
        assignment: {
          include: {
            class: { select: { id: true, name: true, teacherId: true } },
            student: { include: { class: { select: { teacherId: true } } } },
            lesson: {
              select: {
                title: true,
                topic: true,
                generations: {
                  select: { id: true, generationType: true, outputData: true },
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    const ownerId =
      submission.assignment.class?.teacherId ||
      submission.assignment.student?.class?.teacherId;
    if (ownerId !== teacherId) throw new ForbiddenException('Access denied');

    return {
      id: submission.id,
      status: submission.status,
      grade: submission.grade,
      feedback: submission.feedback,
      content: submission.content,
      attachments: submission.attachments,
      formData: (submission as any).formData ?? null,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      student: submission.student
        ? {
            id: submission.student.id,
            name: submission.student.name,
            avatar: submission.student.avatar,
            email: submission.student.email,
            className: submission.student.class?.name || null,
          }
        : null,
      assignment: {
        id: submission.assignmentId,
        title: submission.assignment.lesson.title,
        topic: submission.assignment.lesson.topic,
        dueDate: submission.assignment.dueDate,
        className: submission.assignment.class?.name || null,
        generations: submission.assignment.lesson.generations.map((g) => ({
          id: g.id,
          type: g.generationType,
          outputData: g.outputData,
        })),
      },
    };
  }

  async getTeacherDashboard(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: {
        id: true,
        name: true,
        assignments: {
          select: {
            id: true,
            submissions: { select: { studentId: true, grade: true } },
          },
        },
      },
    });

    let totalPending = 0;
    const byClass: Array<{ classId: string; className: string; pending: number }> = [];

    for (const cls of classes) {
      let classPending = 0;
      for (const assignment of cls.assignments) {
        const submittedIds = new Set(assignment.submissions.map((s) => s.studentId));
        const gradedIds = new Set(
          assignment.submissions.filter((s) => s.grade !== null).map((s) => s.studentId),
        );
        classPending += [...submittedIds].filter((id) => !gradedIds.has(id)).length;
      }
      totalPending += classPending;
      if (classPending > 0) {
        byClass.push({ classId: cls.id, className: cls.name, pending: classPending });
      }
    }

    return { totalPending, byClass };
  }
}
