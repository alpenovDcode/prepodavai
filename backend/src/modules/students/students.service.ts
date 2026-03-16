import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';

@Injectable()
export class StudentsService {
    constructor(
        private prisma: PrismaService,
        private classesService: ClassesService,
    ) { }

    async createStudent(userId: string, data: { classId: string; name: string; email?: string }) {
        // Verify class ownership
        await this.classesService.getClass(userId, data.classId);

        // Generate simple access code (e.g. 6 digits)
        const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

        return this.prisma.student.create({
            data: {
                ...data,
                accessCode,
                avatar: this.getInitials(data.name),
            },
        });
    }

    async getStudents(userId: string, classId?: string) {
        const whereClause: any = {
            class: {
                teacherId: userId,
            },
        };

        if (classId) {
            whereClause.classId = classId;
        }

        return this.prisma.student.findMany({
            where: whereClause,
            include: {
                class: {
                    select: { name: true },
                },
            },
            orderBy: { name: 'asc' },
        });
    }

    async getStudent(userId: string, studentId: string) {
        const student = await this.prisma.student.findUnique({
            where: { id: studentId },
            include: {
                class: true,
                assignments: {
                    include: {
                        lesson: true,
                        submissions: true
                    }
                }
            },
        });

        if (!student || student.class.teacherId !== userId) {
            throw new NotFoundException('Student not found');
        }

        return student;
    }

    async updateStudent(userId: string, studentId: string, data: { name?: string; email?: string; notes?: string }) {
        const student = await this.prisma.student.findUnique({
            where: { id: studentId },
            include: { class: true },
        });

        if (!student || student.class.teacherId !== userId) {
            throw new NotFoundException('Student not found');
        }

        return this.prisma.student.update({
            where: { id: studentId },
            data,
        });
    }

    async deleteStudent(userId: string, studentId: string) {
        const student = await this.prisma.student.findUnique({
            where: { id: studentId },
            include: { class: true },
        });

        if (!student || student.class.teacherId !== userId) {
            throw new NotFoundException('Student not found');
        }

        return this.prisma.student.delete({
            where: { id: studentId },
        });
    }

    async findByAccessCode(accessCode: string) {
        return this.prisma.student.findUnique({
            where: { accessCode },
            include: { class: true },
        });
    }

    async findById(id: string) {
        return this.prisma.student.findUnique({
            where: { id },
            include: { class: true },
        });
    }

    async getMe(studentId: string) {
        const student = await this.prisma.student.findUnique({
            where: { id: studentId },
            include: { class: { select: { id: true, name: true } } },
        });
        if (!student) {
            return null;
        }
        return {
            id: student.id,
            name: student.name,
            email: student.email,
            avatar: student.avatar,
            className: student.class?.name || null,
            classId: student.classId,
        };
    }

    private getInitials(name: string): string {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }
}
