import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService) {}

  async createSubmission(
    studentId: string,
    data: { assignmentId: string; content?: string; fileUrl?: string; attachments?: any[] },
  ) {
    // Verify assignment exists and belongs to the student (or their class)
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: data.assignmentId },
      include: { student: true, class: { include: { students: true } } },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Check if student is allowed to submit
    const isDirectlyAssigned = assignment.studentId === studentId;
    const isClassAssigned =
      assignment.classId && assignment.class.students.some((s) => s.id === studentId);

    if (!isDirectlyAssigned && !isClassAssigned) {
      throw new ForbiddenException('You are not assigned to this task');
    }

    // Prepare attachments payload
    let attachmentsPayload = null;
    if (data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
      attachmentsPayload = data.attachments;
    } else if (data.fileUrl) {
      attachmentsPayload = [{ url: data.fileUrl, type: 'file' }];
    }

    return this.prisma.submission.create({
      data: {
        assignmentId: data.assignmentId,
        studentId: studentId,
        content: data.content,
        attachments: attachmentsPayload,
        status: 'submitted',
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

    // Fetch submission with assignment to verify teacher ownership
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            class: true,
            student: { include: { class: true } },
          },
        },
        student: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Verify teacher owns the assignment's class
    const teacherIdOfClass =
      submission.assignment.class?.teacherId || submission.assignment.student?.class?.teacherId;

    if (teacherIdOfClass !== teacherId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.submission.update({
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
  }

  async getSubmissionsForAssignment(teacherId: string, assignmentId: string) {
    // Verify teacher owns the assignment
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        class: { include: { students: { orderBy: { name: 'asc' } } } },
        student: { include: { class: true } },
        lesson: {
          include: {
            generations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const ownerId = assignment.class?.teacherId || assignment.student?.class?.teacherId;
    if (ownerId !== teacherId) {
      throw new ForbiddenException('Access denied');
    }

    // Fetch all submissions for this assignment
    const submissions = await this.prisma.submission.findMany({
      where: { assignmentId },
      include: {
        student: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build per-student response including students who haven't submitted
    const studentsInClass =
      assignment.class?.students || (assignment.student ? [assignment.student] : []);

    const studentStatuses = studentsInClass.map((student) => {
      const studentSubmissions = submissions.filter((s) => s.studentId === student.id);
      const latestSubmission = studentSubmissions[0] || null;

      return {
        student: { id: student.id, name: student.name, avatar: (student as any).avatar },
        submission: latestSubmission,
        allSubmissions: studentSubmissions,
        status: latestSubmission
          ? latestSubmission.grade !== null
            ? 'graded'
            : 'submitted'
          : 'pending',
      };
    });

    // Extract assignment content from the generation
    let assignmentContent = null;
    if (assignment.lesson?.generations?.length > 0) {
      const gen = assignment.lesson.generations[0];
      const outputData = gen.outputData as any;
      assignmentContent = outputData?.content || outputData?.html || outputData?.text || null;
    }

    return {
      assignment: {
        id: assignment.id,
        dueDate: assignment.dueDate,
        title: assignment.lesson.title,
        content: assignmentContent,
      },
      studentStatuses,
      totalStudents: studentsInClass.length,
      submittedCount: studentStatuses.filter((s) => s.status !== 'pending').length,
      gradedCount: studentStatuses.filter((s) => s.status === 'graded').length,
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
}
