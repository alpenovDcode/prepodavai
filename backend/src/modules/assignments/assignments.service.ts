import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';
import { StudentsService } from '../students/students.service';

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
    // { content: "..." } — основной формат HTML-генераций
    if (typeof outputData.content === 'string') {
      return { ...outputData, content: stripAnswerKeyFromHtml(outputData.content) };
    }
    // Презентации и другие JSON-форматы — не трогаем
    return outputData;
  }

  return outputData;
}

function stripAnswerKeyFromHtml(html: string): string {
  let result = html;

  // 1. Элемент с классом teacher-answers-only
  result = result.replace(/<div[^>]*class\s*=\s*["'][^"']*teacher-answers-only[^"']*["'][^>]*>[\s\S]*/i, '');

  // 2. Горизонтальный разделитель (обычно стоит перед разделом ответов)
  result = result.replace(/<hr[^>]*>[\s\S]*/i, '');

  // 3. Заголовки "Ключ ответов" / "Ключ Ответов"
  result = result.replace(/<(h[1-6]|p)\b[^>]*>(?:<[^>]*>)*\s*Ключ\s*[Оо]тветов\s*(?:<\/[^>]*>)*<\/\1>[\s\S]*/i, '');

  // 4. Заголовок "ОТВЕТЫ" / "Ответы" в теге h1-h6
  result = result.replace(/<h[1-6]\b[^>]*>(?:<[^>]*>)*\s*[ОоOo][тТtT][вВvV][еЕeE][тТtT][ыЫyY]\s*(?:<\/[^>]*>)*<\/h[1-6]>[\s\S]*/i, '');

  // 5. Параграф или div с выравниванием по центру, содержащий только "ОТВЕТЫ"
  result = result.replace(/<(?:p|div)\b[^>]*(?:center|text-align\s*:\s*center)[^>]*>(?:<[^>]*>)*\s*[ОоOo][тТtT][вВvV][еЕeE][тТtT][ыЫyY]\s*(?:<\/[^>]*>)*<\/(?:p|div)>[\s\S]*/i, '');

  // 6. Таблица ответов: содержит колонки "Ответ" + "Баллы"
  result = result.replace(/<table\b[^>]*>(?:(?!<\/table>)[\s\S])*(?:[Оо]твет|ОТВЕТ)(?:(?!<\/table>)[\s\S])*(?:[Бб]алл|БАЛЛ)(?:(?!<\/table>)[\s\S])*<\/table>/g, '');

  // 7. Финальный fallback: обрезаем от "Ключ ответов" или "ОТВЕТЫ" в отдельной строке
  const cutoff = result.search(/(?:Ключ\s*[Оо]тветов|^ОТВЕТЫ$)/im);
  if (cutoff > 0) result = result.slice(0, cutoff);

  return result.trim();
}

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private classesService: ClassesService,
    private studentsService: StudentsService,
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

    return this.prisma.assignment.create({
      data: {
        lessonId: data.lessonId,
        classId: data.classId,
        studentId: data.studentId,
        dueDate: data.dueDate,
        generationId: resolvedGenerationId,
        status: 'assigned',
      },
    });
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
          select: { status: true, createdAt: true },
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
}
