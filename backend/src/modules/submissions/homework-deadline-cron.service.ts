import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';

const TICK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STARTUP_DELAY_MS = 60 * 1000; // 1 minute after boot
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000; // remind when due within next 24h

@Injectable()
export class HomeworkDeadlineCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HomeworkDeadlineCronService.name);
  private intervalRef: NodeJS.Timeout | null = null;
  private startupTimeoutRef: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.startupTimeoutRef = setTimeout(() => {
      this.tick().catch((err) => this.logger.error(`Initial tick failed: ${err?.message}`));
      this.intervalRef = setInterval(() => {
        this.tick().catch((err) => this.logger.error(`Tick failed: ${err?.message}`));
      }, TICK_INTERVAL_MS);
    }, STARTUP_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.startupTimeoutRef) clearTimeout(this.startupTimeoutRef);
    if (this.intervalRef) clearInterval(this.intervalRef);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);

      const assignments = await this.prisma.assignment.findMany({
        where: {
          dueDate: { gt: now, lte: horizon },
          status: { not: 'graded' },
        },
        include: {
          lesson: { select: { title: true } },
          student: {
            select: {
              id: true, name: true, email: true,
              class: { select: { teacher: { select: { notifyWeeklyReport: true } } } },
            },
          },
          class: {
            select: {
              teacher: { select: { notifyWeeklyReport: true } },
              students: { select: { id: true, name: true, email: true } },
            },
          },
          submissions: { select: { studentId: true } },
        },
      });

      let sent = 0;
      for (const assignment of assignments) {
        const dueDate = assignment.dueDate;
        if (!dueDate) continue;

        const recipients = assignment.student
          ? [assignment.student]
          : (assignment.class?.students ?? []);
        const submittedIds = new Set(assignment.submissions.map((s) => s.studentId));

        const teacherNotifyEnabled =
          assignment.class?.teacher?.notifyWeeklyReport ??
          (assignment.student as any)?.class?.teacher?.notifyWeeklyReport ??
          false;

        for (const student of recipients) {
          if (submittedIds.has(student.id)) continue;

          const alreadySent = await this.prisma.notification.findFirst({
            where: {
              userType: 'student',
              userId: student.id,
              type: 'homework_deadline_reminder',
              metadata: { path: ['assignmentId'], equals: assignment.id },
            },
            select: { id: true },
          });
          if (alreadySent) continue;

          try {
            await this.notificationsService.createNotification({
              userId: student.id,
              userType: 'student',
              type: 'homework_deadline_reminder',
              title: 'Скоро дедлайн',
              message: `Срок сдачи задания "${assignment.lesson.title}" истекает ${dueDate.toLocaleString('ru-RU')}.`,
              metadata: {
                assignmentId: assignment.id,
                lessonTitle: assignment.lesson.title,
                dueDate: dueDate.toISOString(),
              },
            });

            const email = student.email?.trim();
            if (teacherNotifyEnabled && email) {
              await this.emailService.sendHomeworkDeadlineReminderEmail(email, {
                studentName: student.name,
                lessonTitle: assignment.lesson.title,
                dueDate,
                assignmentId: assignment.id,
              });
            }

            sent++;
          } catch (err: any) {
            this.logger.warn(`Failed to send deadline reminder to student ${student.id}: ${err?.message}`);
          }
        }
      }

      if (sent > 0) {
        this.logger.log(`Deadline reminders sent: ${sent}`);
      }
    } finally {
      this.running = false;
    }
  }
}
