import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(userId: string) {
    // 1. Total Students
    // Count students connected to classes owned by this teacher
    const totalStudents = await this.prisma.student.count({
      where: {
        class: {
          teacherId: userId,
        },
      },
    });

    // 2. Tokens Used
    // Sum tokensUsed in UserGeneration table
    const tokenResult = await this.prisma.userGeneration.aggregate({
      where: { userId },
      _sum: {
        tokensUsed: true,
      },
    });
    const tokensUsed = tokenResult._sum.tokensUsed || 0;

    // 3. Average Score
    // Avg grade in Submissions connected to assignments of classes owned by this teacher
    const gradeResult = await this.prisma.submission.aggregate({
      where: {
        assignment: {
          class: {
            teacherId: userId,
          },
        },
        grade: {
          not: null,
        },
      },
      _avg: {
        grade: true,
      },
    });
    const rawAvgScore = gradeResult._avg.grade || 0;
    // Normalize logic: assuming grades are 1-5, let's map to percentage, e.g. 5=100%, 4=80%, 3=60%
    const avgScorePercent = rawAvgScore > 0 ? (rawAvgScore / 5) * 100 : 0;

    // 4. Courses/Classes Active
    const coursesActive = await this.prisma.class.count({
      where: { teacherId: userId },
    });

    // 5. Course Engagement (Class Engagement)
    // Find all classes, their students count and submitted assignment count
    const classes = await this.prisma.class.findMany({
      where: { teacherId: userId },
      include: {
        _count: {
          select: { students: true },
        },
        assignments: {
          include: {
            _count: {
              select: { submissions: true },
            },
          },
        },
      },
    });

    const colors = ['bg-primary-600', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-purple-500', 'bg-blue-500'];
    const courseEngagement = classes.map((cls, idx) => {
      const studentCount = cls._count.students;
      const assignmentsCount = cls.assignments.length;
      
      let engagement = 0;
      if (studentCount > 0 && assignmentsCount > 0) {
        let totalPossibleSubmissions = studentCount * assignmentsCount;
        let actualSubmissions = 0;
        cls.assignments.forEach(a => {
            actualSubmissions += a._count.submissions;
        });
        engagement = Math.round((actualSubmissions / totalPossibleSubmissions) * 100);
      } else if (studentCount > 0 && assignmentsCount === 0) {
        engagement = 0; // No assignments yet
      }

      return {
        name: cls.name,
        engagement: engagement > 100 ? 100 : engagement,
        color: colors[idx % colors.length],
      };
    }).sort((a, b) => b.engagement - a.engagement).slice(0, 4); // Top 4 for UI

    // 6. Top Students
    // Retrieve students and calculate their avg grade
    const students = await this.prisma.student.findMany({
      where: {
        class: {
          teacherId: userId,
        },
      },
      include: {
        submissions: true,
        class: {
             include: {
                 assignments: true
             }
        }
      },
    });

    const studentStats = students.map((student) => {
      const gradedSubmissions = student.submissions.filter((s) => s.grade !== null);
      let avgGrade = 0;
      if (gradedSubmissions.length > 0) {
        const sum = gradedSubmissions.reduce((acc, s) => acc + (s.grade || 0), 0);
        avgGrade = sum / gradedSubmissions.length;
      }
      
      const scoreNum = Math.round((avgGrade / 5) * 100);
      
      // Calculate completion %
      const totalClassAssignments = student.class?.assignments.length || 0;
      const completionNum = totalClassAssignments > 0 
        ? Math.round((student.submissions.length / totalClassAssignments) * 100)
        : 0;

      let status = 'Good';
      if (scoreNum >= 90) status = 'Отлично';
      else if (scoreNum >= 75) status = 'Хорошо';
      else status = 'Средне';

      return {
        name: student.name,
        score: scoreNum,
        scoreRaw: avgGrade,
        completion: completionNum > 100 ? 100 : completionNum,
        status,
      };
    });

    const topStudents = studentStats
      .sort((a, b) => b.scoreRaw - a.scoreRaw)
      .slice(0, 5); // Return top 5

    return {
      stats: {
        totalStudents,
        tokensUsed,
        avgScore: avgScorePercent.toFixed(1),
        coursesActive,
      },
      courseEngagement,
      topStudents,
    };
  }

  async getQuickStats(userId: string) {
    // 1. Total Generations (User Specific)
    const generationsCount = await this.prisma.userGeneration.count({
      where: { userId, status: 'completed' },
    });

    // 2. Global Generations (to make the counter feel "real-time")
    const globalGenerationsCount = await this.prisma.userGeneration.count({
      where: { status: 'completed' },
    });

    // 3. Total Credits Spent
    const creditResult = await this.prisma.userGeneration.aggregate({
      where: { userId, status: 'completed' },
      _sum: { creditCost: true },
    });
    const totalCreditsSpent = creditResult._sum.creditCost || 0;

    // 4. Fixed count as requested: "сколько функций есть 17"
    const toolsCount = 17;

    return {
      materialsCount: toolsCount,
      generationsCount,
      globalGenerationsCount,
      totalCreditsSpent,
    };
  }
}
