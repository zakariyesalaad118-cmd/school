import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { db } from '../config/database.ts';
import { recordAuditLog } from '../services/auditService.ts';
import {
  buildExamTelemetryForUser,
  computeGradeLetter,
  getScopedExamAccessContext,
} from '../services/examTelemetryService.ts';
import type {
  IAcademicResult,
  IExamMark,
  IExamSchedule,
  IExamSession,
  IStudent,
} from '../types/models.ts';
import { hasPermission } from '../utils/permissions.ts';
import {
  bulkExamMarksSchema,
  examScheduleSchema,
  examSessionSchema,
  publishExamMarksSchema,
} from '../validators/schemas.ts';

function isAllowedExamViewer(req: Request): boolean {
  const { user, role, effectivePermissions } = req.auth!;
  return (
    user.isSuperAdmin ||
    Boolean(role?.isSuperAdminRole) ||
    hasPermission(effectivePermissions, 'exams', 'view') ||
    hasPermission(effectivePermissions, 'exams', 'create') ||
    hasPermission(effectivePermissions, 'exams', 'edit') ||
    hasPermission(effectivePermissions, 'exams', 'approve') ||
    hasPermission(effectivePermissions, 'exams', 'manage')
  );
}

function isStaffPortalBlocked(req: Request): boolean {
  const { user, role } = req.auth!;
  if (user.isSuperAdmin || role?.isSuperAdminRole) return false;
  return role?.slug === 'student' || role?.slug === 'parent';
}

function canEditSchedules(req: Request): boolean {
  if (isStaffPortalBlocked(req)) return false;
  const perms = req.auth!.effectivePermissions;
  return (
    hasPermission(perms, 'exams', 'create') ||
    hasPermission(perms, 'exams', 'edit') ||
    hasPermission(perms, 'exams', 'manage')
  );
}

function canApproveOrPublish(req: Request): boolean {
  if (isStaffPortalBlocked(req)) return false;
  const perms = req.auth!.effectivePermissions;
  return (
    hasPermission(perms, 'exams', 'approve') ||
    hasPermission(perms, 'exams', 'manage')
  );
}

function matchesScheduleSection(studentSection: string, scheduleSection: string): boolean {
  if (!scheduleSection || scheduleSection.toLowerCase() === 'all') return true;
  return studentSection.trim().toUpperCase() === scheduleSection.trim().toUpperCase();
}

export async function getExamsOverview(req: Request, res: Response) {
  if (!isAllowedExamViewer(req)) {
    res.status(403).json({ error: 'Missing permission to view examinations', code: 'FORBIDDEN' });
    return;
  }

  const telemetry = await buildExamTelemetryForUser({
    user: req.auth!.user,
    role: req.auth!.role,
    effectivePermissions: req.auth!.effectivePermissions,
  });

  const [sessions, allUsers, allRoles] = await Promise.all([
    db.examSessions.findAll(),
    isStaffPortalBlocked(req) ? Promise.resolve([]) : db.users.findAll({ status: 'active' }),
    isStaffPortalBlocked(req) ? Promise.resolve([]) : db.roles.findAll(),
  ]);

  const roleMap = new Map(allRoles.map((r) => [r.id, r]));
  const invigilators = allUsers
    .filter((u) => {
      const r = roleMap.get(u.roleId);
      return r?.slug !== 'student' && r?.slug !== 'parent';
    })
    .map((u) => ({
      id: u.id,
      fullName: u.fullName,
      roleName: roleMap.get(u.roleId)?.name || 'Staff',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  res.json({
    telemetry,
    sessions: sessions.sort((a, b) => b.startDate.localeCompare(a.startDate)),
    invigilators,
  });
}

export async function listExamSessions(req: Request, res: Response) {
  if (!isAllowedExamViewer(req)) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return;
  }
  const sessions = await db.examSessions.findAll();
  sessions.sort((a, b) => b.startDate.localeCompare(a.startDate));
  res.json({ sessions });
}

export async function createExamSession(req: Request, res: Response) {
  if (!canEditSchedules(req)) {
    res.status(403).json({ error: 'Missing permission to create exam sessions', code: 'FORBIDDEN' });
    return;
  }
  const parsed = examSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid exam session payload' });
    return;
  }

  const now = new Date().toISOString();
  const session: IExamSession = {
    id: `exs_${crypto.randomUUID().slice(0, 10)}`,
    ...parsed.data,
    createdBy: req.auth!.user.fullName,
    createdById: req.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.examSessions.create(session);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'EXAM_SESSION_CREATED',
    resourceType: 'exam_session',
    resourceId: session.id,
    details: { title: session.title, academicYear: session.academicYear, term: session.term },
    severity: 'info',
  });

  res.status(201).json({ session });
}

export async function updateExamSession(req: Request, res: Response) {
  if (!canEditSchedules(req)) {
    res.status(403).json({ error: 'Missing permission to update exam sessions', code: 'FORBIDDEN' });
    return;
  }
  const existing = await db.examSessions.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Exam session not found' });
    return;
  }

  const parsed = examSessionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid exam session update' });
    return;
  }

  const mergedStart = parsed.data.startDate ?? existing.startDate;
  const mergedEnd = parsed.data.endDate ?? existing.endDate;
  if (mergedEnd < mergedStart) {
    res.status(400).json({ error: 'End date must be on or after start date' });
    return;
  }

  const updated = await db.examSessions.updateById(existing.id, {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  });
  res.json({ session: updated });
}

export async function deleteExamSession(req: Request, res: Response) {
  if (isStaffPortalBlocked(req) || !hasPermission(req.auth!.effectivePermissions, 'exams', 'delete')) {
    if (!hasPermission(req.auth!.effectivePermissions, 'exams', 'manage') || isStaffPortalBlocked(req)) {
      res.status(403).json({ error: 'Missing permission to delete exam sessions', code: 'FORBIDDEN' });
      return;
    }
  }
  const existing = await db.examSessions.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Exam session not found' });
    return;
  }
  await db.examSessions.deleteById(existing.id);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'EXAM_SESSION_DELETED',
    resourceType: 'exam_session',
    resourceId: existing.id,
    details: { title: existing.title },
    severity: 'warning',
  });
  res.json({ success: true });
}

export async function listExamSchedules(req: Request, res: Response) {
  if (!isAllowedExamViewer(req)) {
    res.status(403).json({ error: 'Missing permission to view exam schedules', code: 'FORBIDDEN' });
    return;
  }

  const scope = await getScopedExamAccessContext({
    user: req.auth!.user,
    role: req.auth!.role,
    effectivePermissions: req.auth!.effectivePermissions,
  });

  const academicYear = typeof req.query.academicYear === 'string' ? req.query.academicYear.trim() : '';
  const division = typeof req.query.division === 'string' ? req.query.division.trim() : '';
  const gradeLevel = typeof req.query.gradeLevel === 'string' ? req.query.gradeLevel.trim() : '';
  const term = typeof req.query.term === 'string' ? req.query.term.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const [allSchedules, allMarks, allStudents] = await Promise.all([
    db.examSchedules.findAll(),
    db.examMarks.findAll(),
    db.students.findAll({ status: 'active' }),
  ]);

  let schedules = allSchedules;
  if (scope.isRestrictedPortal) {
    schedules = schedules.filter((s) => scope.allowedGrades.has(s.gradeLevel));
  }
  if (academicYear) schedules = schedules.filter((s) => s.academicYear === academicYear);
  if (division) schedules = schedules.filter((s) => s.division === division);
  if (gradeLevel) schedules = schedules.filter((s) => s.gradeLevel === gradeLevel);
  if (term) schedules = schedules.filter((s) => s.term === term);
  if (status) schedules = schedules.filter((s) => s.status === status);
  if (search) {
    schedules = schedules.filter(
      (s) =>
        s.subjectName.toLowerCase().includes(search) ||
        s.subjectCode.toLowerCase().includes(search) ||
        s.examTitle.toLowerCase().includes(search) ||
        s.gradeLevel.toLowerCase().includes(search) ||
        s.room.toLowerCase().includes(search) ||
        s.invigilatorName.toLowerCase().includes(search)
    );
  }

  schedules.sort((a, b) => a.examDate.localeCompare(b.examDate) || a.startTime.localeCompare(b.startTime));

  const enriched = schedules.map((sch) => {
    const marksForSchedule = allMarks.filter((m) => m.examScheduleId === sch.id);
    const eligibleStudents = allStudents.filter(
      (st) =>
        st.division === sch.division &&
        st.gradeLevel === sch.gradeLevel &&
        st.academicYear === sch.academicYear &&
        matchesScheduleSection(st.section, sch.section)
    );

    const visibleMarks = scope.isRestrictedPortal
      ? marksForSchedule.filter((m) => scope.allowedStudentIds.has(m.studentId) && m.status === 'published')
      : marksForSchedule;

    return {
      ...sch,
      eligibleStudentsCount: eligibleStudents.length,
      gradedCount: visibleMarks.length,
      publishedCount: visibleMarks.filter((m) => m.status === 'published').length,
      averagePercentage:
        visibleMarks.length > 0
          ? Math.round(
              (visibleMarks.reduce((sum, m) => sum + m.percentage, 0) / visibleMarks.length) * 10
            ) / 10
          : null,
    };
  });

  res.json({ schedules: enriched });
}

export async function createExamSchedule(req: Request, res: Response) {
  if (!canEditSchedules(req)) {
    res.status(403).json({ error: 'Missing permission to schedule examinations', code: 'FORBIDDEN' });
    return;
  }

  const parsed = examScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid exam schedule payload' });
    return;
  }

  const data = parsed.data;
  const existingSchedules = await db.examSchedules.findAll({ examDate: data.examDate });

  const overlapConflict = existingSchedules.find((ex) => {
    if (ex.status === 'cancelled') return false;
    const timesOverlap = data.startTime < ex.endTime && data.endTime > ex.startTime;
    if (!timesOverlap) return false;
    const sameRoom = ex.room.trim().toLowerCase() === data.room.trim().toLowerCase();
    const sameClass =
      ex.gradeLevel === data.gradeLevel &&
      (ex.section === 'All' || data.section === 'All' || ex.section.toUpperCase() === data.section.toUpperCase());
    return sameRoom || sameClass;
  });

  if (overlapConflict) {
    res.status(409).json({
      error: `Schedule conflict with "${overlapConflict.subjectName}" (${overlapConflict.gradeLevel}, Room ${overlapConflict.room}, ${overlapConflict.startTime}–${overlapConflict.endTime}).`,
      code: 'SCHEDULE_CONFLICT',
    });
    return;
  }

  let invigilatorName = data.invigilatorName;
  if (data.invigilatorId) {
    const inv = await db.users.findById(data.invigilatorId);
    if (inv) invigilatorName = inv.fullName;
  }

  const now = new Date().toISOString();
  const schedule: IExamSchedule = {
    id: `exsch_${crypto.randomUUID().slice(0, 10)}`,
    ...data,
    section: data.section.toLowerCase() === 'all' ? 'All' : data.section.toUpperCase(),
    subjectCode: data.subjectCode.toUpperCase(),
    invigilatorName,
    createdBy: req.auth!.user.fullName,
    createdById: req.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.examSchedules.create(schedule);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'EXAM_SCHEDULE_CREATED',
    resourceType: 'exam_schedule',
    resourceId: schedule.id,
    details: {
      examTitle: schedule.examTitle,
      subjectName: schedule.subjectName,
      gradeLevel: schedule.gradeLevel,
      examDate: schedule.examDate,
      room: schedule.room,
    },
    severity: 'info',
  });

  res.status(201).json({ schedule });
}

export async function updateExamSchedule(req: Request, res: Response) {
  if (!canEditSchedules(req)) {
    res.status(403).json({ error: 'Missing permission to update exam schedules', code: 'FORBIDDEN' });
    return;
  }

  const existing = await db.examSchedules.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Exam schedule not found' });
    return;
  }

  const parsed = examScheduleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid exam schedule update' });
    return;
  }

  const merged = { ...existing, ...parsed.data };
  if (merged.endTime <= merged.startTime) {
    res.status(400).json({ error: 'End time must be after start time' });
    return;
  }
  if (merged.passMarks > merged.maxMarks) {
    res.status(400).json({ error: 'Pass marks cannot exceed max marks' });
    return;
  }

  const sameDateSchedules = await db.examSchedules.findAll({ examDate: merged.examDate });
  const overlapConflict = sameDateSchedules.find((ex) => {
    if (ex.id === existing.id || ex.status === 'cancelled') return false;
    if (merged.status === 'cancelled') return false;
    const timesOverlap = merged.startTime < ex.endTime && merged.endTime > ex.startTime;
    if (!timesOverlap) return false;
    const sameRoom = ex.room.trim().toLowerCase() === merged.room.trim().toLowerCase();
    const sameClass =
      ex.gradeLevel === merged.gradeLevel &&
      (ex.section === 'All' || merged.section === 'All' || ex.section.toUpperCase() === merged.section.toUpperCase());
    return sameRoom || sameClass;
  });

  if (overlapConflict) {
    res.status(409).json({
      error: `Schedule conflict with "${overlapConflict.subjectName}" (${overlapConflict.gradeLevel}, Room ${overlapConflict.room}, ${overlapConflict.startTime}–${overlapConflict.endTime}).`,
      code: 'SCHEDULE_CONFLICT',
    });
    return;
  }

  let invigilatorName = merged.invigilatorName;
  if (parsed.data.invigilatorId) {
    const inv = await db.users.findById(parsed.data.invigilatorId);
    if (inv) invigilatorName = inv.fullName;
  }

  const updated = await db.examSchedules.updateById(existing.id, {
    ...parsed.data,
    section:
      parsed.data.section !== undefined
        ? parsed.data.section.toLowerCase() === 'all'
          ? 'All'
          : parsed.data.section.toUpperCase()
        : existing.section,
    subjectCode:
      parsed.data.subjectCode !== undefined
        ? parsed.data.subjectCode.toUpperCase()
        : existing.subjectCode,
    invigilatorName,
    updatedAt: new Date().toISOString(),
  });

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'EXAM_SCHEDULE_UPDATED',
    resourceType: 'exam_schedule',
    resourceId: existing.id,
    details: { subjectName: updated?.subjectName, examDate: updated?.examDate, status: updated?.status },
    severity: 'info',
  });

  res.json({ schedule: updated });
}

export async function deleteExamSchedule(req: Request, res: Response) {
  if (
    isStaffPortalBlocked(req) ||
    (!hasPermission(req.auth!.effectivePermissions, 'exams', 'delete') &&
      !hasPermission(req.auth!.effectivePermissions, 'exams', 'manage'))
  ) {
    res.status(403).json({ error: 'Missing permission to delete exam schedules', code: 'FORBIDDEN' });
    return;
  }

  const existing = await db.examSchedules.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Exam schedule not found' });
    return;
  }

  const marks = await db.examMarks.findAll({ examScheduleId: existing.id });
  for (const m of marks) {
    await db.examMarks.deleteById(m.id);
  }
  await db.examSchedules.deleteById(existing.id);

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'EXAM_SCHEDULE_DELETED',
    resourceType: 'exam_schedule',
    resourceId: existing.id,
    details: { subjectName: existing.subjectName, gradeLevel: existing.gradeLevel },
    severity: 'warning',
  });

  res.json({ success: true });
}

export async function getExamScheduleMarksRoster(req: Request, res: Response) {
  if (!isAllowedExamViewer(req) || isStaffPortalBlocked(req)) {
    res.status(403).json({ error: 'Staff permission required for exam mark entry roster', code: 'FORBIDDEN' });
    return;
  }

  const schedule = await db.examSchedules.findById(req.params.id);
  if (!schedule) {
    res.status(404).json({ error: 'Exam schedule not found' });
    return;
  }

  const [allStudents, existingMarks] = await Promise.all([
    db.students.findAll({ status: 'active' }),
    db.examMarks.findAll({ examScheduleId: schedule.id }),
  ]);

  const markByStudentId = new Map(existingMarks.map((m) => [m.studentId, m]));

  const eligibleStudents = allStudents
    .filter(
      (s) =>
        s.division === schedule.division &&
        s.gradeLevel === schedule.gradeLevel &&
        s.academicYear === schedule.academicYear &&
        matchesScheduleSection(s.section, schedule.section)
    )
    .sort((a, b) => a.section.localeCompare(b.section) || a.fullName.localeCompare(b.fullName));

  // Include any student who already has a mark even if section changed later
  const rosterIds = new Set(eligibleStudents.map((s) => s.id));
  const extraStudents = allStudents.filter((s) => !rosterIds.has(s.id) && markByStudentId.has(s.id));
  const combinedStudents = [...eligibleStudents, ...extraStudents];

  const roster = combinedStudents.map((student) => {
    const existing = markByStudentId.get(student.id) || null;
    return {
      student: {
        id: student.id,
        studentId: student.studentId,
        fullName: student.fullName,
        division: student.division,
        gradeLevel: student.gradeLevel,
        section: student.section,
        className: student.className,
        photoUrl: student.photoUrl,
      },
      mark: existing,
    };
  });

  res.json({
    schedule,
    roster,
    summary: {
      totalStudents: roster.length,
      enteredCount: existingMarks.length,
      publishedCount: existingMarks.filter((m) => m.status === 'published').length,
      approvedCount: existingMarks.filter((m) => m.status === 'approved').length,
      submittedCount: existingMarks.filter((m) => m.status === 'submitted').length,
      draftCount: existingMarks.filter((m) => m.status === 'draft').length,
    },
  });
}

export async function recordBulkExamMarks(req: Request, res: Response) {
  if (!canEditSchedules(req)) {
    res.status(403).json({ error: 'Missing permission to enter examination marks', code: 'FORBIDDEN' });
    return;
  }

  const schedule = await db.examSchedules.findById(req.params.id);
  if (!schedule) {
    res.status(404).json({ error: 'Exam schedule not found' });
    return;
  }

  const parsed = bulkExamMarksSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid exam marks payload' });
    return;
  }

  const { submitStatus, entries } = parsed.data;
  const [allStudents, existingMarks] = await Promise.all([
    db.students.findAll(),
    db.examMarks.findAll({ examScheduleId: schedule.id }),
  ]);

  const studentMap = new Map<string, IStudent>(allStudents.map((s) => [s.id, s]));
  const existingMap = new Map<string, IExamMark>(existingMarks.map((m) => [m.studentId, m]));

  for (const entry of entries) {
    if (!studentMap.has(entry.studentId)) {
      res.status(404).json({ error: `Student ${entry.studentId} not found` });
      return;
    }
    if (entry.score > schedule.maxMarks) {
      res.status(400).json({
        error: `Score ${entry.score} exceeds maximum marks (${schedule.maxMarks}) for this exam.`,
      });
      return;
    }
  }

  const now = new Date().toISOString();
  const saved: IExamMark[] = [];

  for (const entry of entries) {
    const student = studentMap.get(entry.studentId)!;
    const rawScore = entry.attendanceStatus === 'sat' ? entry.score : 0;
    const percentage = Math.round((rawScore / schedule.maxMarks) * 1000) / 10;
    const passed = entry.attendanceStatus === 'sat' && rawScore >= schedule.passMarks;
    const gradeLetter = entry.attendanceStatus === 'sat' ? computeGradeLetter(percentage) : 'F';

    const existing = existingMap.get(student.id);
    if (existing) {
      const updated = await db.examMarks.updateById(existing.id, {
        examTitle: schedule.examTitle,
        academicYear: schedule.academicYear,
        term: schedule.term,
        division: schedule.division,
        gradeLevel: schedule.gradeLevel,
        section: student.section,
        subjectName: schedule.subjectName,
        studentCode: student.studentId,
        studentName: student.fullName,
        score: rawScore,
        maxMarks: schedule.maxMarks,
        passMarks: schedule.passMarks,
        percentage,
        gradeLetter,
        passed,
        attendanceStatus: entry.attendanceStatus,
        status: existing.status === 'published' && !canApproveOrPublish(req) ? 'submitted' : submitStatus,
        remarks: entry.remarks,
        enteredBy: req.auth!.user.fullName,
        enteredById: req.auth!.user.id,
        updatedAt: now,
      });
      if (updated) saved.push(updated);
    } else {
      const created: IExamMark = {
        id: `exm_${crypto.randomUUID().slice(0, 12)}`,
        examScheduleId: schedule.id,
        examSessionId: schedule.examSessionId,
        examTitle: schedule.examTitle,
        academicYear: schedule.academicYear,
        term: schedule.term,
        division: schedule.division,
        gradeLevel: schedule.gradeLevel,
        section: student.section,
        subjectName: schedule.subjectName,
        studentId: student.id,
        studentCode: student.studentId,
        studentName: student.fullName,
        score: rawScore,
        maxMarks: schedule.maxMarks,
        passMarks: schedule.passMarks,
        percentage,
        gradeLetter,
        passed,
        attendanceStatus: entry.attendanceStatus,
        status: submitStatus,
        remarks: entry.remarks,
        enteredBy: req.auth!.user.fullName,
        enteredById: req.auth!.user.id,
        approvedBy: null,
        approvedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.examMarks.create(created);
      saved.push(created);
    }
  }

  if (submitStatus === 'submitted' && schedule.status === 'scheduled') {
    await db.examSchedules.updateById(schedule.id, { status: 'completed', updatedAt: now });
  }

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'EXAM_MARKS_RECORDED',
    resourceType: 'exam_mark',
    resourceId: schedule.id,
    details: {
      subjectName: schedule.subjectName,
      gradeLevel: schedule.gradeLevel,
      count: saved.length,
      submitStatus,
    },
    severity: 'info',
  });

  res.json({ marks: saved, count: saved.length });
}

export async function publishExamMarks(req: Request, res: Response) {
  if (!canApproveOrPublish(req)) {
    res.status(403).json({
      error: 'Approval permission (exams:approve or exams:manage) is required to publish results',
      code: 'FORBIDDEN',
    });
    return;
  }

  const parsed = publishExamMarksSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid publish request' });
    return;
  }

  const { examScheduleId, action, syncAnnualResults } = parsed.data;
  const schedule = await db.examSchedules.findById(examScheduleId);
  if (!schedule) {
    res.status(404).json({ error: 'Exam schedule not found' });
    return;
  }

  const marks = await db.examMarks.findAll({ examScheduleId: schedule.id });
  if (marks.length === 0) {
    res.status(400).json({ error: 'No marks have been entered for this exam yet.' });
    return;
  }

  const now = new Date().toISOString();
  const nextStatus =
    action === 'publish' ? 'published' : action === 'approve' ? 'approved' : 'draft';

  for (const m of marks) {
    await db.examMarks.updateById(m.id, {
      status: nextStatus,
      approvedBy: nextStatus === 'draft' ? null : req.auth!.user.fullName,
      approvedAt: nextStatus === 'draft' ? null : now,
      updatedAt: now,
    });
  }

  if (action === 'publish' && schedule.status === 'scheduled') {
    await db.examSchedules.updateById(schedule.id, { status: 'completed', updatedAt: now });
  }

  // Sync annual / final averages into academicResults so promotion module reflects real exam marks
  let syncedAcademicResultsCount = 0;
  if (action === 'publish' && syncAnnualResults) {
    const allYearMarks = await db.examMarks.findAll({ academicYear: schedule.academicYear });
    const publishedForYear = allYearMarks.filter(
      (m) => m.status === 'published' || m.examScheduleId === schedule.id
    );
    const allAcademicResults = await db.academicResults.findAll({ academicYear: schedule.academicYear });
    const resultTerm: 'Final' | 'Annual' = schedule.term === 'Annual' ? 'Annual' : 'Final';

    const studentIds = Array.from(new Set(marks.map((m) => m.studentId)));
    for (const sid of studentIds) {
      const studentMarks = publishedForYear.filter((m) => m.studentId === sid);
      if (studentMarks.length === 0) continue;
      const avg =
        Math.round(
          (studentMarks.reduce((sum, m) => sum + m.percentage, 0) / studentMarks.length) * 10
        ) / 10;
      const sample = studentMarks[0];
      const outcome = avg >= 50 ? 'passed' : 'retained';
      const existingAcad = allAcademicResults.find(
        (r) =>
          r.studentId === sid &&
          r.gradeLevel === sample.gradeLevel &&
          r.term === resultTerm
      );

      if (existingAcad) {
        await db.academicResults.updateById(existingAcad.id, {
          averageScore: avg,
          outcome,
          status: 'published',
          remarks: `Computed from ${studentMarks.length} published exam subject(s)`,
          processedBy: req.auth!.user.fullName,
          processedAt: now,
          updatedAt: now,
        });
      } else {
        const createdAcad: IAcademicResult = {
          id: `res_${crypto.randomUUID().slice(0, 12)}`,
          studentId: sid,
          studentCode: sample.studentCode,
          academicYear: schedule.academicYear,
          gradeLevel: sample.gradeLevel,
          section: sample.section,
          term: resultTerm,
          averageScore: avg,
          outcome,
          status: 'published',
          remarks: `Computed from ${studentMarks.length} published exam subject(s)`,
          processedBy: req.auth!.user.fullName,
          processedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        await db.academicResults.create(createdAcad);
      }
      syncedAcademicResultsCount += 1;
    }
  }

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: action === 'publish' ? 'EXAM_RESULTS_PUBLISHED' : 'EXAM_RESULTS_STATUS_UPDATED',
    resourceType: 'exam_mark',
    resourceId: schedule.id,
    details: {
      subjectName: schedule.subjectName,
      gradeLevel: schedule.gradeLevel,
      action,
      count: marks.length,
      syncedAcademicResultsCount,
    },
    severity: 'info',
  });

  res.json({
    success: true,
    status: nextStatus,
    updatedCount: marks.length,
    syncedAcademicResultsCount,
  });
}

export async function listExamMarks(req: Request, res: Response) {
  if (!isAllowedExamViewer(req)) {
    res.status(403).json({ error: 'Missing permission to view examination results', code: 'FORBIDDEN' });
    return;
  }

  const scope = await getScopedExamAccessContext({
    user: req.auth!.user,
    role: req.auth!.role,
    effectivePermissions: req.auth!.effectivePermissions,
  });

  const academicYear = typeof req.query.academicYear === 'string' ? req.query.academicYear.trim() : '';
  const term = typeof req.query.term === 'string' ? req.query.term.trim() : '';
  const gradeLevel = typeof req.query.gradeLevel === 'string' ? req.query.gradeLevel.trim() : '';
  const subjectName = typeof req.query.subjectName === 'string' ? req.query.subjectName.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let marks = await db.examMarks.findAll();

  if (scope.isRestrictedPortal) {
    marks = marks.filter((m) => scope.allowedStudentIds.has(m.studentId) && m.status === 'published');
  }

  if (academicYear) marks = marks.filter((m) => m.academicYear === academicYear);
  if (term) marks = marks.filter((m) => m.term === term);
  if (gradeLevel) marks = marks.filter((m) => m.gradeLevel === gradeLevel);
  if (subjectName) marks = marks.filter((m) => m.subjectName === subjectName);
  if (status && !scope.isRestrictedPortal) marks = marks.filter((m) => m.status === status);
  if (studentId) marks = marks.filter((m) => m.studentId === studentId);
  if (search) {
    marks = marks.filter(
      (m) =>
        m.studentName.toLowerCase().includes(search) ||
        m.studentCode.toLowerCase().includes(search) ||
        m.subjectName.toLowerCase().includes(search) ||
        m.examTitle.toLowerCase().includes(search) ||
        m.gradeLevel.toLowerCase().includes(search)
    );
  }

  marks.sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.studentName.localeCompare(b.studentName)
  );

  const avgScore =
    marks.length > 0
      ? Math.round((marks.reduce((sum, m) => sum + m.percentage, 0) / marks.length) * 10) / 10
      : 0;
  const passedCount = marks.filter((m) => m.passed && m.attendanceStatus === 'sat').length;
  const passRate = marks.length > 0 ? Math.round((passedCount / marks.length) * 1000) / 10 : 0;

  res.json({
    marks,
    summary: {
      total: marks.length,
      published: marks.filter((m) => m.status === 'published').length,
      averagePercentage: avgScore,
      passRate,
    },
  });
}
