import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ClassesService {
    constructor(private prisma: PrismaService) { }

    async createClass(userId: string, data: { name: string; description?: string }) {
        try {
            return await this.prisma.class.create({
                data: {
                    ...data,
                    teacherId: userId,
                },
            });
        } catch (error) {
            console.error('Error creating class:', error);
            throw error;
        }
    }

    async getClasses(userId: string) {
        try {
            return await this.prisma.class.findMany({
                where: { teacherId: userId },
                include: {
                    _count: {
                        select: { students: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
        } catch (error) {
            console.error('Error getting classes:', error);
            throw error;
        }
    }

    async getClass(userId: string, classId: string) {
        const cls = await this.prisma.class.findUnique({
            where: { id: classId },
            include: {
                students: true,
                assignments: {
                    include: {
                        lesson: true,
                    },
                    orderBy: { createdAt: 'desc' }
                }
            },
        });

        if (!cls || cls.teacherId !== userId) {
            throw new NotFoundException('Class not found');
        }

        return cls;
    }

    async updateClass(userId: string, classId: string, data: { name?: string; description?: string }) {
        const cls = await this.prisma.class.findUnique({
            where: { id: classId },
        });

        if (!cls || cls.teacherId !== userId) {
            throw new NotFoundException('Class not found');
        }

        return this.prisma.class.update({
            where: { id: classId },
            data,
        });
    }

    async deleteClass(userId: string, classId: string) {
        const cls = await this.prisma.class.findUnique({
            where: { id: classId },
        });

        if (!cls || cls.teacherId !== userId) {
            throw new NotFoundException('Class not found');
        }

        return this.prisma.class.delete({
            where: { id: classId },
        });
    }
}
