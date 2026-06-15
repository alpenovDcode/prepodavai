import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';
import { StudentsService } from '../students/students.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../../common/services/email.service';
import { stripAnswerKeyFromHtml } from '../../common/utils/strip-answer-key.util';

/**
 * Удаляет раздел с ответами из HTML-контента генерации перед отдачей студенту.
 * Работает с outputData любого типа (строка, объект с content, JSON).
 */
function stripAnswerKeyFromOutput(outputData: any): any {
  if (!outputData) return outputData;

  if (typeof outputData === 'string') {
    return stripAnswerKeyFromHtml(outputData);
  }

  if (typeof outputData === 'object') {
    // HTML может лежать в любом из этих полей — фронт ищет их в этом же порядке
    // (см. extractHtmlFromOutput в frontend/src/components/InteractiveHtmlViewer.tsx).
    // Стрипим каждое строковое поле, чтобы ученик не получил ключ ответов через DevTools.
    const HTML_FIELDS = ['content', 'htmlResult', 'html', 'text'] as const;
    let touched = false;
    const next: Record<string, any> = { ...outputData };
    for (const f of HTML_FIELDS) {
      if (typeof next[f] === 'string') {
        next[f] = stripAnswerKeyFromHtml(next[f]);
        touched = true;
      }
    }
    return touched ? next : outputData;
  }

  return outputData;
}

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private prisma: PrismaService,
    private classesService: ClassesService,
    private studentsService: StudentsService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  async createAssignment(
    userId: string,
    data: { lessonId: string; classId?: string; studentId?: string; dueDate?: Date; generationId?: string },
  ) {
    // Validate inputs
    if (!data.classId && !data.studentId) {
      throw new BadRequestException('Either classId or studentId must be provided');
    }

    // Verify ownership
    if (data.classId) {
      await this.classesService.getClass(userId, data.classId);
    }
    if (data.studentId) {
      await this.studentsService.getStudent(userId, data.studentId);
    }

    // Verify lesson ownership
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: data.lessonId },
    });
    if (!lesson || lesson.userId !== userId) {
      throw new NotFoundException('Lesson not found');
    }

    // Resolve generationId: фронт может прислать UserGeneration.id ИЛИ GenerationRequest.id
    // (activeGenerationId в хуке — это requestId). Нормализуем к UserGeneration.id.
    let resolvedGenerationId: string | undefined = undefined;
    if (data.generationId) {
      let gen = await this.prisma.userGeneration.findUnique({
        where: { id: data.generationId },
      });
      if (!gen) {
        gen = await this.prisma.userGeneration.findUnique({
          where: { generationRequestId: data.generationId },
        });
      }
      if (!gen) {
        throw new NotFoundException('Генерация не найдена');
      }
      if (gen.userId !== userId) {
        throw new BadRequestException('Доступ к генерации запрещён');
      }
      resolvedGenerationId = gen.id;
    }

    // Create assignment(s)
    // If assigned to a class, we might want to create individual assignments for each student later,
    // but for now let's stick to the schema which allows assigning to a class directly.
    // However, to track individual submissions, we usually need an assignment record per student OR
    // a single assignment record for the class and multiple submission records.
    // The current schema has `Assignment` linking to `Class` OR `Student`.
    // Let's create one Assignment record.

    const assignment = await this.prisma.assignment.create({
      data: {
        lessonId: data.lessonId,
        classId: data.classId,
        studentId: data.studentId,
        dueDate: data.dueDate,
        generationId: resolvedGenerationId,
        status: 'assigned',
      },
    });

    this._notifyStudentsOnAssignment(assignment, lesson, userId).catch(() => {});

    return assignment;
  }

  private async _notifyStudentsOnAssignment(
    assignment: { id: string; classId?: string | null; studentId?: string | null; dueDate?: Date | null },
    lesson: { title: string },
    teacherId: string,
  ) {
    let students: Array<{ id: string; name: string; email?: string | null }> = [];

    if (assignment.classId) {
      students = await this.prisma.student.findMany({
        where: { classId: assignment.classId },
        select: { id: true, name: true, email: true },
      });
    } else if (assignment.studentId) {
      const student = await this.prisma.student.findUnique({
        where: { id: assignment.studentId },
        select: { id: true, name: true, email: true },
      });
      if (student) students = [student];
    }

    const teacher = await this.prisma.appUser.findUnique({
      where: { id: teacherId },
      select: { notifyWeeklyReport: true },
    });

    for (const student of students) {
      const dueSuffix = assignment.dueDate
        ? ` Срок сдачи: ${assignment.dueDate.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`
        : '';

      await this.notificationsService.createNotification({
        userId: student.id,
        userType: 'student',
        type: 'homework_assigned',
        title: 'Новое домашнее задание',
        message: `Учитель задал вам домашнее задание «${lesson.title}».${dueSuffix}`,
        metadata: { assignmentId: assignment.id, lessonTitle: lesson.title, dueDate: assignment.dueDate },
      });

      const studentEmail = student.email?.trim();
      if (teacher?.notifyWeeklyReport && studentEmail) {
        this.emailService
          .sendHomeworkAssignedEmail(studentEmail, {
            studentName: student.name,
            lessonTitle: lesson.title,
            dueDate: assignment.dueDate ?? null,
            assignmentId: assignment.id,
          })
          .catch((err) =>
            this.logger.warn(`Failed to send homework-assigned email to ${studentEmail}: ${err?.message}`),
          );
      }
    }
  }

  async getAssignments(
    userId: string,
    filters: { classId?: string; studentId?: string; lessonId?: string },
  ) {
    // We need to ensure the user owns the related entities
    const whereClause: any = {};

    if (filters.classId) {
      whereClause.classId = filters.classId;
      whereClause.class = { teacherId: userId };
    } else if (filters.studentId) {
      whereClause.studentId = filters.studentId;
      whereClause.student = { class: { teacherId: userId } };
    } else {
      // General fetch for teacher - complex because assignments can be linked via class or student
      whereClause.OR = [
        { class: { teacherId: userId } },
        { student: { class: { teacherId: userId } } },
      ];
    }

    if (filters.lessonId) {
      whereClause.lessonId = filters.lessonId;
    }

    return this.prisma.assignment.findMany({
      where: whereClause,
      include: {
        lesson: { select: { title: true, topic: true } },
        class: { select: { name: true } },
        student: { select: { name: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAssignment(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        lesson: {
          include: {
            generations: {
              where: { status: 'completed' },
              orderBy: { createdAt: 'desc' },
            },
            user: { select: { firstName: true, lastName: true, subject: true } },
          },
        },
        class: true,
        student: { include: { class: true } },
        submissions: {
          include: { student: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Check ownership (Teacher OR Student)
    const teacherId = assignment.class?.teacherId || assignment.student?.class?.teacherId;
    const isTeacher = teacherId === userId;

    // Check if it's the assigned student
    const isAssignedStudent = assignment.studentId === userId;

    // Check if it's a student in the assigned class
    // We need to fetch the student to check their classId if userId is a student
    let isStudentInClass = false;
    if (!isTeacher && !isAssignedStudent && assignment.classId) {
      const student = await this.prisma.student.findUnique({ where: { id: userId } });
      if (student && student.classId === assignment.classId) {
        isStudentInClass = true;
      }
    }

    if (!isTeacher && !isAssignedStudent && !isStudentInClass) {
      throw new NotFoundException('Assignment not found');
    }

    // Filter out teacher-only generations for students
    const STUDENT_HIDDEN_TYPES = ['answers', 'answer-key', 'teacher-notes', 'rubric'];
    if (!isTeacher) {
      assignment.lesson.generations = assignment.lesson.generations.filter(
        (g) => !STUDENT_HIDDEN_TYPES.includes(g.generationType),
      );

      // Strip answer sections embedded inside HTML content
      assignment.lesson.generations = assignment.lesson.generations.map((g) => ({
        ...g,
        outputData: stripAnswerKeyFromOutput(g.outputData),
      }));
    }

    // If this assignment is for a specific generation, filter to show only that one
    const generationId = (assignment as any).generationId as string | null;
    if (generationId) {
      assignment.lesson.generations = assignment.lesson.generations.filter(
        (g) => g.id === generationId,
      );
    }

    return assignment;
  }

  async getMyAssignments(studentId: string) {
    // Find the student to get their classId
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { classId: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.prisma.assignment.findMany({
      where: {
        OR: [{ studentId: studentId }, { classId: student.classId }],
      },
      include: {
        lesson: {
          select: {
            title: true,
            topic: true,
            generations: {
              select: { generationType: true },
            },
          },
        },
        class: { select: { name: true } },
        student: { select: { name: true } },
        submissions: {
          where: { studentId: studentId },
          select: { status: true, createdAt: true, grade: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAssignmentsByClass(teacherId: string, classId: string) {
    // Verify class ownership
    await this.classesService.getClass(teacherId, classId);

    const assignments = await this.prisma.assignment.findMany({
      where: { classId },
      include: {
        lesson: {
          select: { id: true, title: true, topic: true },
        },
        submissions: {
          select: { id: true, studentId: true, grade: true, status: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Count students in class
    const studentCount = await this.prisma.student.count({ where: { classId } });

    return assignments.map((a) => {
      const uniqueSubmitters = new Set(a.submissions.map((s) => s.studentId)).size;
      const gradedCount = a.submissions.filter((s) => s.grade !== null).length;

      return {
        id: a.id,
        dueDate: a.dueDate,
        status: a.status,
        createdAt: a.createdAt,
        lesson: a.lesson,
        totalStudents: studentCount,
        submittedCount: uniqueSubmitters,
        gradedCount,
      };
    });
  }

  /**
   * Полная сводка по заданию для страницы карточки в учительском интерфейсе:
   *   - meta задания (название, тема, дедлайн, статус)
   *   - все генерации урока с outputData (для предпросмотра материала)
   *   - список учеников класса со статусом сдачи у каждого
   *
   * Если задание выдано конкретному ученику (studentId, без classId) — в
   * списке будет один ученик. Если классу — все ученики класса.
   */
  async getAssignmentOverview(teacherId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        lesson: {
          include: {
            generations: {
              where: { status: 'completed' },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        class: true,
        student: { include: { class: true } },
        submissions: { include: { student: true } },
      },
    });

    if (!assignment) throw new NotFoundException('Assignment not found');

    const ownerTeacher = assignment.class?.teacherId || assignment.student?.class?.teacherId;
    if (ownerTeacher !== teacherId) {
      throw new NotFoundException('Assignment not found');
    }

    // Список учеников, кому это задание адресовано
    const targetStudents = assignment.classId
      ? await this.prisma.student.findMany({
          where: { classId: assignment.classId, status: 'active' },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, avatar: true, email: true },
        })
      : assignment.student
        ? [{
            id: assignment.student.id,
            name: assignment.student.name,
            avatar: assignment.student.avatar,
            email: assignment.student.email,
          }]
        : [];

    // Последняя сабмишн от каждого ученика — по дате создания
    const latestByStudent = new Map<string, typeof assignment.submissions[number]>();
    for (const sub of assignment.submissions) {
      const cur = latestByStudent.get(sub.studentId);
      if (!cur || cur.createdAt < sub.createdAt) latestByStudent.set(sub.studentId, sub);
    }

    const dueDate = assignment.dueDate;
    const now = new Date();

    const students = targetStudents.map((s) => {
      const sub = latestByStudent.get(s.id);
      let status: 'not_submitted' | 'submitted' | 'graded' | 'overdue' = 'not_submitted';
      if (sub) {
        if (sub.grade !== null && sub.grade !== undefined) status = 'graded';
        else status = 'submitted';
      } else if (dueDate && dueDate < now) {
        status = 'overdue';
      }
      const isLate = sub && dueDate ? sub.createdAt > dueDate : false;
      return {
        id: s.id,
        name: s.name,
        avatar: s.avatar,
        email: s.email,
        status,
        isLate,
        submission: sub
          ? {
              id: sub.id,
              grade: sub.grade ?? null,
              createdAt: sub.createdAt,
              feedback: sub.feedback ?? null,
            }
          : null,
      };
    });

    const totals = {
      total: students.length,
      submitted: students.filter((s) => s.status === 'submitted' || s.status === 'graded').length,
      graded: students.filter((s) => s.status === 'graded').length,
      overdue: students.filter((s) => s.status === 'overdue').length,
      pending: students.filter((s) => s.status === 'submitted').length,
    };

    return {
      assignment: {
        id: assignment.id,
        status: assignment.status,
        dueDate: assignment.dueDate,
        createdAt: assignment.createdAt,
        scope: assignment.classId ? 'class' : 'student',
        className: assignment.class?.name ?? assignment.student?.class?.name ?? null,
      },
      lesson: {
        id: assignment.lesson.id,
        title: assignment.lesson.title,
        topic: assignment.lesson.topic,
        generations: assignment.lesson.generations.map((g) => ({
          id: g.id,
          type: g.generationType,
          title: g.title,
          outputData: g.outputData,
        })),
      },
      totals,
      students,
    };
  }
}
