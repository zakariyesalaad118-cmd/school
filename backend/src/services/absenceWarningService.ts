import crypto from 'node:crypto';
import type { Request } from 'express';
import { db } from '../config/database.ts';
import type {
  AbsenceSubjectType,
  AttendanceStatus,
  IAbsenceWarning,
  IDepartment,
  IRole,
  IStudent,
  IUser,
} from '../types/models.ts';
import { recordAuditLog } from './auditService.ts';

function parseIsoUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function diffCalendarDays(isoA: string, isoB: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseIsoUtcMs(isoB) - parseIsoUtcMs(isoA)) / msPerDay);
}

/**
 * Finds all streaks of >= 3 consecutive calendar days where a student or teacher
 * has only 'absent' attendance records (any 'present', 'late', or 'excused'
 * record on a day breaks the absence streak).
 */
export function findConsecutiveAbsenceStreaks(
  records: Array<{ date: string; status: AttendanceStatus }>
): string[][] {
  if (records.length === 0) return [];

  const dayStatusMap = new Map<string, 'absent' | 'not_absent'>();
  for (const rec of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) continue;
    const prev = dayStatusMap.get(rec.date);
    if (rec.status !== 'absent') {
      dayStatusMap.set(rec.date, 'not_absent');
    } else if (prev !== 'not_absent') {
      dayStatusMap.set(rec.date, 'absent');
    }
  }

  const sortedDates = Array.from(dayStatusMap.keys()).sort();
  const streaks: string[][] = [];
  let current: string[] = [];

  for (const date of sortedDates) {
    const dayStatus = dayStatusMap.get(date);
    if (dayStatus === 'absent') {
      if (current.length === 0) {
        current = [date];
      } else {
        const gap = diffCalendarDays(current[current.length - 1], date);
        if (gap === 1) {
          current.push(date);
        } else {
          if (current.length >= 3) streaks.push(current);
          current = [date];
        }
      }
    } else {
      if (current.length >= 3) streaks.push(current);
      current = [];
    }
  }

  if (current.length >= 3) {
    streaks.push(current);
  }

  return streaks;
}

interface SubjectMeta {
  id: string;
  code: string;
  name: string;
  detail: string;
  contactPhone: string;
}

async function syncWarningsForSubjectType(params: {
  req?: Request;
  subjectType: AbsenceSubjectType;
  subjectIds?: string[];
}): Promise<{
  newlyTriggered: IAbsenceWarning[];
  updatedWarnings: IAbsenceWarning[];
  autoResolvedCount: number;
}> {
  const { req, subjectType, subjectIds } = params;
  const targetSet = subjectIds && subjectIds.length > 0 ? new Set(subjectIds) : null;

  const subjectMap = new Map<string, SubjectMeta>();
  const recordsBySubject = new Map<string, Array<{ date: string; status: AttendanceStatus }>>();

  if (subjectType === 'student') {
    const [allStudents, allAttendance] = await Promise.all([
      db.students.findAll(),
      db.attendance.findAll(),
    ]);

    for (const s of allStudents as IStudent[]) {
      if (s.status !== 'active') continue;
      if (targetSet && !targetSet.has(s.id)) continue;
      subjectMap.set(s.id, {
        id: s.id,
        code: s.studentId,
        name: s.fullName,
        detail: `${s.className} · ${s.division}`,
        contactPhone: s.guardian?.phone || s.phone || '',
      });
    }

    for (const rec of allAttendance) {
      if (!subjectMap.has(rec.studentId)) continue;
      const list = recordsBySubject.get(rec.studentId) || [];
      list.push({ date: rec.date, status: rec.status });
      recordsBySubject.set(rec.studentId, list);
    }
  } else {
    const [allUsers, allRoles, allDepts, allTeacherAttendance] = await Promise.all([
      db.users.findAll(),
      db.roles.findAll(),
      db.departments.findAll(),
      db.teacherAttendance.findAll(),
    ]);

    const roleById = new Map<string, IRole>(allRoles.map((r) => [r.id, r]));
    const deptById = new Map<string, IDepartment>(allDepts.map((d) => [d.id, d]));
    const recordedTeacherIds = new Set(allTeacherAttendance.map((rec) => rec.teacherId));

    for (const u of allUsers as IUser[]) {
      if (u.status !== 'active') continue;
      if (targetSet && !targetSet.has(u.id)) continue;
      const role = roleById.get(u.roleId);
      const isTeacher =
        u.roleId === 'role_teacher' ||
        role?.slug === 'teacher' ||
        (role?.name || '').toLowerCase().includes('teacher');
      if (!isTeacher && !recordedTeacherIds.has(u.id) && !targetSet?.has(u.id)) continue;

      const deptName = u.departmentId ? deptById.get(u.departmentId)?.name || '' : '';
      subjectMap.set(u.id, {
        id: u.id,
        code: u.username,
        name: u.fullName,
        detail: deptName || role?.name || 'Teaching Staff',
        contactPhone: u.email,
      });
    }

    for (const rec of allTeacherAttendance) {
      if (!subjectMap.has(rec.teacherId)) continue;
      const list = recordsBySubject.get(rec.teacherId) || [];
      list.push({ date: rec.date, status: rec.status });
      recordsBySubject.set(rec.teacherId, list);
    }
  }

  const existingWarnings = await db.absenceWarnings.findAll({ subjectType });
  const warningByStreakKey = new Map<string, IAbsenceWarning>(
    existingWarnings.map((w) => [w.streakKey, w])
  );

  const now = new Date().toISOString();
  const newlyTriggered: IAbsenceWarning[] = [];
  const updatedWarnings: IAbsenceWarning[] = [];
  let autoResolvedCount = 0;

  for (const [subjectId, meta] of subjectMap.entries()) {
    const streaks = findConsecutiveAbsenceStreaks(recordsBySubject.get(subjectId) || []);
    const activeStreakKeys = new Set<string>();

    for (const streak of streaks) {
      const streakKey = `${subjectType}:${subjectId}:${streak[0]}`;
      activeStreakKeys.add(streakKey);
      const severity = streak.length >= 5 ? 'critical' : 'warning';
      const rangeText = `${streak[0]} – ${streak[streak.length - 1]}`;
      const message = `${meta.name} (${meta.code}) has been marked Absent for ${streak.length} consecutive days (${rangeText}).`;

      const existing = warningByStreakKey.get(streakKey);
      if (!existing) {
        const warning: IAbsenceWarning = {
          id: `warn_${crypto.randomUUID().slice(0, 12)}`,
          subjectType,
          subjectId,
          subjectCode: meta.code,
          subjectName: meta.name,
          subjectDetail: meta.detail,
          contactPhone: meta.contactPhone,
          consecutiveDays: streak.length,
          absentDates: streak,
          streakKey,
          severity,
          status: 'open',
          message,
          followUpNotes: [],
          acknowledgedBy: null,
          acknowledgedAt: null,
          resolvedBy: null,
          resolvedAt: null,
          resolutionSummary: '',
          triggeredAt: now,
          lastEvaluatedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        await db.absenceWarnings.create(warning);
        newlyTriggered.push(warning);

        await recordAuditLog({
          req,
          actorId: req?.auth?.user.id || null,
          actorName: req?.auth?.user.fullName || 'Automated Attendance Monitor',
          actorRole: req?.auth?.role?.name || 'System',
          action: 'ABSENCE_WARNING_TRIGGERED',
          resourceType: 'absence_warning',
          resourceId: warning.id,
          details: {
            subjectType,
            subjectId,
            subjectName: meta.name,
            consecutiveDays: streak.length,
            absentDates: streak,
          },
          severity: severity === 'critical' ? 'critical' : 'warning',
        });
      } else {
        const streakExtended = streak.length > existing.consecutiveDays;
        const datesChanged =
          streak.length !== existing.absentDates.length ||
          streak.some((d, i) => d !== existing.absentDates[i]);
        const shouldReopen =
          streakExtended && (existing.status === 'resolved' || existing.status === 'dismissed');

        if (datesChanged || shouldReopen || existing.contactPhone !== meta.contactPhone) {
          const updated = await db.absenceWarnings.updateById(existing.id, {
            subjectCode: meta.code,
            subjectName: meta.name,
            subjectDetail: meta.detail,
            contactPhone: meta.contactPhone,
            consecutiveDays: streak.length,
            absentDates: streak,
            severity,
            status: shouldReopen ? 'open' : existing.status,
            message,
            lastEvaluatedAt: now,
            updatedAt: now,
          });
          if (updated) {
            updatedWarnings.push(updated);
            if (shouldReopen) {
              newlyTriggered.push(updated);
            }
          }
        }
      }
    }

    // Auto-resolve active warnings whose streak fell below 3 consecutive days
    const subjectWarnings = existingWarnings.filter(
      (w) =>
        w.subjectId === subjectId &&
        (w.status === 'open' || w.status === 'acknowledged' || w.status === 'in_progress') &&
        !activeStreakKeys.has(w.streakKey)
    );
    for (const stale of subjectWarnings) {
      await db.absenceWarnings.updateById(stale.id, {
        status: 'resolved',
        resolvedBy: 'Automated Attendance Monitor',
        resolvedAt: now,
        resolutionSummary:
          'Automatically resolved after attendance records no longer showed 3 consecutive absent days.',
        lastEvaluatedAt: now,
        updatedAt: now,
      });
      autoResolvedCount += 1;
    }
  }

  return { newlyTriggered, updatedWarnings, autoResolvedCount };
}

export async function evaluateAbsenceWarnings(params: {
  req?: Request;
  subjectType?: AbsenceSubjectType | 'all';
  subjectIds?: string[];
}): Promise<{
  newlyTriggered: IAbsenceWarning[];
  updatedWarnings: IAbsenceWarning[];
  autoResolvedCount: number;
}> {
  const { req, subjectType = 'all', subjectIds } = params;
  const newlyTriggered: IAbsenceWarning[] = [];
  const updatedWarnings: IAbsenceWarning[] = [];
  let autoResolvedCount = 0;

  if (subjectType === 'all' || subjectType === 'student') {
    const res = await syncWarningsForSubjectType({
      req,
      subjectType: 'student',
      subjectIds: subjectType === 'student' ? subjectIds : undefined,
    });
    newlyTriggered.push(...res.newlyTriggered);
    updatedWarnings.push(...res.updatedWarnings);
    autoResolvedCount += res.autoResolvedCount;
  }

  if (subjectType === 'all' || subjectType === 'teacher') {
    const res = await syncWarningsForSubjectType({
      req,
      subjectType: 'teacher',
      subjectIds: subjectType === 'teacher' ? subjectIds : undefined,
    });
    newlyTriggered.push(...res.newlyTriggered);
    updatedWarnings.push(...res.updatedWarnings);
    autoResolvedCount += res.autoResolvedCount;
  }

  return { newlyTriggered, updatedWarnings, autoResolvedCount };
}
