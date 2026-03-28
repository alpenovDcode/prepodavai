import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReplicateService } from '../replicate/replicate.service';

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private replicateService: ReplicateService,
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

    // Check deadline
    if (assignment.dueDate && new Date() > assignment.dueDate) {
      throw new BadRequestException('Срок сдачи задания истёк');
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
        formData: data.formData || null,
        status: 'submitted',
      },
      include: { student: true },
    });

    await this.prisma.assignment.update({
      where: { id: data.assignmentId },
      data: { status: 'submitted' },
    });

    await this._notifyTeacherOnSubmission(assignment, submission);

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

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: submission.assignmentId },
    });
    if (assignment?.dueDate && new Date() > assignment.dueDate) {
      throw new BadRequestException('Срок сдачи задания истёк');
    }

    return this._updateSubmissionData(submissionId, data);
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
        ...(data.formData !== undefined ? { formData: data.formData || null } : {}),
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

  async generateAiFeedback(teacherId: string, submissionId: string): Promise<{ feedback: string }> {
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
        student: { select: { name: true } },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    const teacherIdOfClass =
      submission.assignment.class?.teacherId ||
      submission.assignment.student?.class?.teacherId;
    if (teacherIdOfClass !== teacherId) throw new ForbiddenException('Access denied');

    const lessonTitle = submission.assignment.lesson.title;
    const studentName = submission.student?.name || 'Ученик';
    const textAnswer = submission.content || '';
    const rawFormData = (submission as any).formData;
    const formData = rawFormData ? JSON.stringify(rawFormData, null, 2) : '';

    const prompt = `Ты — опытный и доброжелательный учитель, проверяющий работу ученика.

Тема задания: ${lessonTitle}
Ученик: ${studentName}

Ответ ученика:
${textAnswer || '(текстовый ответ отсутствует)'}${formData ? `\n\nЗаполненные поля задания (JSON):\n${formData}` : ''}

Напиши краткий, конструктивный и поддерживающий комментарий к этой работе на русском языке (3–5 предложений). Отметь, что сделано хорошо, и, если есть ошибки или недочёты, мягко укажи на них и предложи, как улучшить. Пиши связным текстом без заголовков и маркеров.`;

    const feedback = await this.replicateService.createCompletion(prompt, 'google/gemini-3-flash', {
      max_tokens: 512,
      temperature: 0.7,
    });
    return { feedback };
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
