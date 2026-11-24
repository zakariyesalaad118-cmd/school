import { db } from '../config/database.ts';
import type { IExamMark, IExamSchedule, IRole, IUser } from '../types/models.ts';
import { hasPermission } from '../utils/permissions.ts';

export function computeGradeLetter(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 75) return 'B+';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C+';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}

export interface ExamDashboardTelemetry {
  summary: {
    totalSchedules: number;
    upcomingExams: number;
    completedExams: number;
    totalMarksRecorded: number;
    publishedMarksCount: number;
    averageScore: number;
    passRate: number;
    pendingApprovalCount: number;
  };
  upcomingSchedules: Array<{
    id: string;
    examTitle: string;
    subjectName: string;
    subjectCode: string;
    gradeLevel: string;
    section: string;
    division: 'Primary' | 'Secondary';
    examDate: string;
    startTime: string;
    endTime: string;
    room: string;
    invigilatorName: string;
    term: string;
    academicYear: string;
    status: string;
  }>;
  subjectPerformance: Array<{
    subject: string;
    averagePercentage: number;
    passRate: number;
    gradedCount: number;
  }>;
  gradeDistribution: Array<{
    grade: string;
    count: number;
  }>;
  recentResults: Array<{
    id: string;
    studentId: string;
    studentCode: string;
    studentName: string;
    gradeLevel: string;
    section: string;
    subjectName: string;
    examTitle: string;
    term: string;
    score: number;
    maxMarks: number;
    percentage: number;
    gradeLetter: string;
    passed: boolean;
    attendanceStatus: string;
    status: string;
    updatedAt: string;
  }>;
}

export async function getScopedExamAccessContext(params: {
  user: IUser;
  role: IRole | null;
  effectivePermissions: string[];
}): Promise<{
  canViewExams: boolean;
  isRestrictedPortal: boolean;
  allowedStudentIds: Set<string>;
  allowedGrades: Set<string>;
}> {
  const { user, role, effectivePermissions } = params;
  const canViewExams =
    user.isSuperAdmin ||
    Boolean(role?.isSuperAdminRole) ||
    hasPermission(effectivePermissions, 'exams', 'view') ||
    hasPermission(effectivePermissions, 'exams', 'create') ||
    hasPermission(effectivePermissions, 'exams', 'edit') ||
    hasPermission(effectivePermissions, 'exams', 'approve') ||
    hasPermission(effectivePermissions, 'exams', 'manage');

  const isRestrictedPortal =
    !user.isSuperAdmin &&
    !role?.isSuperAdminRole &&
    (role?.slug === 'student' || role?.slug === 'parent');

  const allowedStudentIds = new Set<string>();
  const allowedGrades = new Set<string>();

  if (isRestrictedPortal) {
    const students = await db.students.findAll();
    for (const s of students) {
      const matched =
        role?.slug === 'student' ? s.linkedUserId === user.id : s.linkedParentUserId === user.id;
      if (matched) {
        allowedStudentIds.add(s.id);
        allowedGrades.add(s.gradeLevel);
      }
    }
  }

  return { canViewExams, isRestrictedPortal, allowedStudentIds, allowedGrades };
}

export async function buildExamTelemetryForUser(params: {
  user: IUser;
  role: IRole | null;
  effectivePermissions: string[];
}): Promise<ExamDashboardTelemetry | null> {
  const scope = await getScopedExamAccessContext(params);
  if (!scope.canViewExams) return null;

  const [allSchedules, allMarks] = await Promise.all([
    db.examSchedules.findAll(),
    db.examMarks.findAll(),
  ]);

  let schedules: IExamSchedule[] = allSchedules;
  let marks: IExamMark[] = allMarks;

  if (scope.isRestrictedPortal) {
    schedules = allSchedules.filter((sch) => scope.allowedGrades.has(sch.gradeLevel));
    marks = allMarks.filter(
      (m) => scope.allowedStudentIds.has(m.studentId) && m.status === 'published'
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingList = schedules
    .filter((s) => s.status === 'scheduled' && s.examDate >= todayIso)
    .sort((a, b) => a.examDate.localeCompare(b.examDate) || a.startTime.localeCompare(b.startTime));

  const publishedMarks = marks.filter((m) => m.status === 'published');
  const gradedPool = publishedMarks.length > 0 ? publishedMarks : marks;

  const avgScore =
    gradedPool.length > 0
      ? Math.round(
          (gradedPool.reduce((sum, m) => sum + m.percentage, 0) / gradedPool.length) * 10
        ) / 10
      : 0;
  const passCount = gradedPool.filter((m) => m.passed && m.attendanceStatus === 'sat').length;
  const passRate =
    gradedPool.length > 0 ? Math.round((passCount / gradedPool.length) * 1000) / 10 : 0;

  const subjectMap = new Map<
    string,
    { totalPct: number; passedCount: number; totalCount: number }
  >();
  for (const m of gradedPool) {
    const entry = subjectMap.get(m.subjectName) || {
      totalPct: 0,
      passedCount: 0,
      totalCount: 0,
    };
    entry.totalPct += m.percentage;
    entry.totalCount += 1;
    if (m.passed && m.attendanceStatus === 'sat') {
      entry.passedCount += 1;
    }
    subjectMap.set(m.subjectName, entry);
  }

  const subjectPerformance = Array.from(subjectMap.entries())
    .map(([subject, stat]) => ({
      subject,
      averagePercentage: Math.round((stat.totalPct / stat.totalCount) * 10) / 10,
      passRate: Math.round((stat.passedCount / stat.totalCount) * 1000) / 10,
      gradedCount: stat.totalCount,
    }))
    .sort((a, b) => b.averagePercentage - a.averagePercentage)
    .slice(0, 8);

  const gradeBuckets = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
  const gradeCounts = new Map<string, number>(gradeBuckets.map((g) => [g, 0]));
  for (const m of gradedPool) {
    gradeCounts.set(m.gradeLetter, (gradeCounts.get(m.gradeLetter) || 0) + 1);
  }

  const recentResults = [...marks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      studentId: m.studentId,
      studentCode: m.studentCode,
      studentName: m.studentName,
      gradeLevel: m.gradeLevel,
      section: m.section,
      subjectName: m.subjectName,
      examTitle: m.examTitle,
      term: m.term,
      score: m.score,
      maxMarks: m.maxMarks,
      percentage: m.percentage,
      gradeLetter: m.gradeLetter,
      passed: m.passed,
      attendanceStatus: m.attendanceStatus,
      status: m.status,
      updatedAt: m.updatedAt,
    }));

  return {
    summary: {
      totalSchedules: schedules.length,
      upcomingExams: upcomingList.length,
      completedExams: schedules.filter((s) => s.status === 'completed').length,
      totalMarksRecorded: marks.length,
      publishedMarksCount: publishedMarks.length,
      averageScore: avgScore,
      passRate,
      pendingApprovalCount: scope.isRestrictedPortal
        ? 0
        : marks.filter((m) => m.status === 'submitted' || m.status === 'draft').length,
    },
    upcomingSchedules: upcomingList.slice(0, 8).map((s) => ({
      id: s.id,
      examTitle: s.examTitle,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      gradeLevel: s.gradeLevel,
      section: s.section,
      division: s.division,
      examDate: s.examDate,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      invigilatorName: s.invigilatorName,
      term: s.term,
      academicYear: s.academicYear,
      status: s.status,
    })),
    subjectPerformance,
    gradeDistribution: gradeBuckets.map((grade) => ({
      grade,
      count: gradeCounts.get(grade) || 0,
    })),
    recentResults,
  };
}
