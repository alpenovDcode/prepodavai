import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LessonsService {
    constructor(private prisma: PrismaService) { }

    async createLesson(userId: string, data: { topic: string; grade?: string; duration?: number }) {
        return (this.prisma as any).lesson.create({
            data: {
                userId,
                title: data.topic,
                topic: data.topic,
                grade: data.grade,
                duration: data.duration,
            },
        });
    }

    async getUserLessons(userId: string) {
        return (this.prisma as any).lesson.findMany({
            where: { userId },
            include: {
                generations: {
                    select: {
                        id: true,
                        generationType: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getLessonById(userId: string, lessonId: string) {
        const lesson = await (this.prisma as any).lesson.findUnique({
            where: { id: lessonId },
            include: {
                generations: {
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!lesson || lesson.userId !== userId) {
            throw new NotFoundException('Lesson not found');
        }

        return lesson;
    }

    async deleteLesson(userId: string, lessonId: string) {
        const lesson = await (this.prisma as any).lesson.findUnique({
            where: { id: lessonId },
        });

        if (!lesson || lesson.userId !== userId) {
            throw new NotFoundException('Lesson not found');
        }

        return (this.prisma as any).lesson.delete({
            where: { id: lessonId },
        });
    }

    async findOrCreateDefaultLesson(userId: string) {
        const defaultTitle = 'ИИ генерации';

        // Поиск существующего урока
        const existingLesson = await (this.prisma as any).lesson.findFirst({
            where: {
                userId,
                title: defaultTitle
            }
        });

        if (existingLesson) {
            return existingLesson;
        }

        // Создание нового, если не найден
        return (this.prisma as any).lesson.create({
            data: {
                userId,
                title: defaultTitle,
                topic: defaultTitle,
                grade: '',
                duration: 0
            }
        });
    }
}
