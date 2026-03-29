import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';
import { StudentsService } from '../students/students.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private classesService: ClassesService,
    private studentsService: StudentsService,
  ) {}

  async createAssignment(
    userId: string,
    data: { lessonId: string; classId?: string; studentId?: string; dueDate?: Date },
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
