import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { db } from '../config/database.ts';
import { env } from '../config/env.ts';
import { evaluateAbsenceWarnings } from '../services/absenceWarningService.ts';
import { recordAuditLog } from '../services/auditService.ts';
import type {
  AbsenceFollowUpEntry,
  AttendanceSession,
  IAttendanceRecord,
  IDepartment,
  IRole,
  IStudent,
  ITeacherAttendanceRecord,
  IUser,
} from '../types/models.ts';
import { hasPermission } from '../utils/permissions.ts';
import {
  absenceWarningFollowUpSchema,
  batchQrSchema,
  bulkAttendanceSchema,
  recordAttendanceSchema,
  teacherBulkAttendanceSchema,
} from '../validators/schemas.ts';

function canTakeAttendance(perms: string[]): boolean {
  return (
    hasPermission(perms, 'attendance', 'create') ||
    hasPermission(perms, 'attendance', 'edit') ||
    hasPermission(perms, 'attendance', 'manage')
  );
}

function canViewAttendanceLog(perms: string[]): boolean {
  return hasPermission(perms, 'attendance', 'view') || canTakeAttendance(perms);
}

function canManageTeacherAttendance(req: Request): boolean {
  const { user, role, effectivePermissions: perms } = req.auth!;
  if (user.isSuperAdmin || role?.isSuperAdminRole) return true;
  if (role?.slug === 'student' || role?.slug === 'parent' || role?.slug === 'teacher') {
    return false;
  }
  return (
    hasPermission(perms, 'attendance', 'manage') ||
    hasPermission(perms, 'teachers', 'manage') ||
    hasPermission(perms, 'hr', 'manage') ||
    hasPermission(perms, 'attendance', 'create') ||
    hasPermission(perms, 'attendance', 'edit')
  );
}

const VALID_SESSIONS = new Set<AttendanceSession>(['Morning', 'Afternoon', 'Full Day']);

const QR_PREFIX = 'NEXUS-ATT-V1';

function computeQrHmac(studentId: string, studentCode: string): string {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${studentId}:${studentCode.toUpperCase()}`)
    .digest('hex')
    .slice(0, 16);
}

export function buildSignedStudentQrPayload(student: Pick<IStudent, 'id' | 'studentId'>): string {
  const code = student.studentId.toUpperCase();
  const sig = computeQrHmac(student.id, code);
  return `${QR_PREFIX}:${student.id}:${code}:${sig}`;
}

export function verifySignedStudentQrPayload(rawPayload: string): {
  valid: boolean;
  studentId?: string;
  studentCode?: string;
  error?: string;
} {
  const parts = rawPayload.trim().split(':');
  if (parts.length !== 4 || parts[0] !== QR_PREFIX) {
    return { valid: false, error: 'Unrecognized student attendance QR format' };
  }

  const [, studentId, studentCodeRaw, providedSig] = parts;
  const studentCode = studentCodeRaw.toUpperCase();
  if (!studentId || !studentCode || !/^[a-f0-9]{16}$/i.test(providedSig)) {
    return { valid: false, error: 'Malformed student attendance QR token' };
  }

  const expectedSig = computeQrHmac(studentId, studentCode);
  const providedBuf = Buffer.from(providedSig.toLowerCase(), 'utf8');
  const expectedBuf = Buffer.from(expectedSig.toLowerCase(), 'utf8');

  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { valid: false, error: 'Invalid or tampered QR signature' };
  }

  return { valid: true, studentId, studentCode };
}

function getAuthorizedStudentIds(req: Request, students: IStudent[]): Set<string> | null {
  const { user, role } = req.auth!;
  if (user.isSuperAdmin || role?.isSuperAdminRole) {
    return null; // unrestricted
  }
  if (role?.slug === 'student') {
    return new Set(students.filter((s) => s.linkedUserId === user.id).map((s) => s.id));
  }
  if (role?.slug === 'parent') {
    return new Set(students.filter((s) => s.linkedParentUserId === user.id).map((s) => s.id));
  }
  return null;
}

async function renderQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 260,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}

export async function listAttendance(req: Request, res: Response) {
  const perms = req.auth!.effectivePermissions;
  if (!canViewAttendanceLog(perms)) {
    res.status(403).json({ error: 'Missing permission to view attendance records' });
    return;
  }

  const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const gradeLevel = typeof req.query.gradeLevel === 'string' ? req.query.gradeLevel.trim() : '';
  const section = typeof req.query.section === 'string' ? req.query.section.trim().toUpperCase() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const session = typeof req.query.session === 'string' ? req.query.session.trim() : '';
  const method = typeof req.query.method === 'string' ? req.query.method.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const [allRecords, allStudents] = await Promise.all([
    db.attendance.findAll(),
    db.students.findAll(),
  ]);

  const allowedIds = getAuthorizedStudentIds(req, allStudents);
  let scoped = allowedIds
    ? allRecords.filter((r) => allowedIds.has(r.studentId))
    : allRecords;

  const activeRoster = (
    allowedIds ? allStudents.filter((s) => allowedIds.has(s.id)) : allStudents
  ).filter((s) => s.status === 'active');

  const dates = Array.from(new Set(scoped.map((r) => r.date))).sort().reverse();

  const summaryScope = date ? scoped.filter((r) => r.date === date) : scoped;
  const presentCount = summaryScope.filter((r) => r.status === 'present').length;
  const lateCount = summaryScope.filter((r) => r.status === 'late').length;
  const absentCount = summaryScope.filter((r) => r.status === 'absent').length;
  const excusedCount = summaryScope.filter((r) => r.status === 'excused').length;
  const markedStudentIds = new Set(summaryScope.map((r) => r.studentId));
  const totalActive = activeRoster.length;
  const attendanceRate =
    summaryScope.length > 0
      ? Math.round(((presentCount + lateCount) / summaryScope.length) * 100)
      : 0;

  const summary = {
    totalLogged: summaryScope.length,
    markedStudents: markedStudentIds.size,
    unmarkedActiveStudents: Math.max(0, totalActive - markedStudentIds.size),
    present: presentCount,
    late: lateCount,
    absent: absentCount,
    excused: excusedCount,
    attendanceRate,
    qrScans: summaryScope.filter((r) => r.method === 'qr_scan').length,
    totalActiveStudents: totalActive,
  };

  if (date) scoped = scoped.filter((r) => r.date === date);
  if (gradeLevel) scoped = scoped.filter((r) => r.gradeLevel === gradeLevel);
  if (section) scoped = scoped.filter((r) => r.section.toUpperCase() === section);
  if (status) scoped = scoped.filter((r) => r.status === status);
  if (session) scoped = scoped.filter((r) => r.session === session);
  if (method) scoped = scoped.filter((r) => r.method === method);
  if (search) {
    scoped = scoped.filter(
      (r) =>
        r.studentName.toLowerCase().includes(search) ||
        r.studentCode.toLowerCase().includes(search) ||
        r.className.toLowerCase().includes(search)
    );
  }

  scoped.sort((a, b) => b.checkInTime.localeCompare(a.checkInTime));

  res.json({
    records: scoped,
    summary,
    facets: { dates },
  });
}

export async function getClassRollCall(req: Request, res: Response) {
  const perms = req.auth!.effectivePermissions;
  const roleSlug = req.auth!.role?.slug;
  if (!canTakeAttendance(perms) || roleSlug === 'student' || roleSlug === 'parent') {
    res.status(403).json({ error: 'Only authorized teaching staff can take class roll-call attendance' });
    return;
  }

  const rawDate = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const targetDate = rawDate || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    res.status(400).json({ error: 'Date must use YYYY-MM-DD format' });
    return;
  }

  const rawSession =
    typeof req.query.session === 'string' ? (req.query.session.trim() as AttendanceSession) : 'Morning';
  const session: AttendanceSession = VALID_SESSIONS.has(rawSession) ? rawSession : 'Morning';

  const gradeLevel = typeof req.query.gradeLevel === 'string' ? req.query.gradeLevel.trim() : '';
  const section = typeof req.query.section === 'string' ? req.query.section.trim().toUpperCase() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const [allStudents, dateRecords] = await Promise.all([
    db.students.findAll(),
    db.attendance.findAll({ date: targetDate }),
  ]);

  let rosterStudents = allStudents.filter((s) => s.status === 'active');
  if (gradeLevel) {
    rosterStudents = rosterStudents.filter((s) => s.gradeLevel === gradeLevel);
  }
  if (section) {
    rosterStudents = rosterStudents.filter((s) => s.section.toUpperCase() === section);
  }
  if (search) {
    rosterStudents = rosterStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(search) ||
        s.studentId.toLowerCase().includes(search) ||
        s.className.toLowerCase().includes(search)
    );
  }

  rosterStudents.sort(
    (a, b) =>
      a.gradeLevel.localeCompare(b.gradeLevel) ||
      a.section.localeCompare(b.section) ||
      a.fullName.localeCompare(b.fullName)
  );

  const sessionMap = new Map<string, IAttendanceRecord>();
  for (const rec of dateRecords) {
    if (rec.session === session) {
      sessionMap.set(rec.studentId, rec);
    }
  }

  const roster = rosterStudents.map((s) => {
    const existing = sessionMap.get(s.id);
    return {
      student: {
        id: s.id,
        studentId: s.studentId,
        fullName: s.fullName,
        division: s.division,
        gradeLevel: s.gradeLevel,
        section: s.section,
        className: s.className,
        academicYear: s.academicYear,
        photoUrl: s.photoUrl,
        gender: s.gender,
      },
      currentStatus: existing ? existing.status : null,
      notes: existing ? existing.notes : '',
      recordId: existing ? existing.id : null,
      recordedBy: existing ? existing.recordedBy : null,
      updatedAt: existing ? existing.updatedAt : null,
    };
  });

  const marked = roster.filter((r) => r.currentStatus !== null).length;
  res.json({
    date: targetDate,
    session,
    roster,
    counts: {
      totalStudents: roster.length,
      marked,
      unmarked: roster.length - marked,
      present: roster.filter((r) => r.currentStatus === 'present').length,
      absent: roster.filter((r) => r.currentStatus === 'absent').length,
      late: roster.filter((r) => r.currentStatus === 'late').length,
      excused: roster.filter((r) => r.currentStatus === 'excused').length,
    },
  });
}

export async function recordBulkAttendance(req: Request, res: Response) {
  const perms = req.auth!.effectivePermissions;
  const roleSlug = req.auth!.role?.slug;
  if (!canTakeAttendance(perms) || roleSlug === 'student' || roleSlug === 'parent') {
    res.status(403).json({ error: 'Only authorized teaching staff can submit class attendance' });
    return;
  }

  const parsed = bulkAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid class roll-call submission',
    });
    return;
  }

  const targetDate = parsed.data.date || new Date().toISOString().slice(0, 10);
  const session = parsed.data.session;

  // Deduplicate entries by studentId (latest entry in payload wins)
  const entryMap = new Map<string, { studentId: string; status: IAttendanceRecord['status']; notes: string }>();
  for (const entry of parsed.data.entries) {
    entryMap.set(entry.studentId, {
      studentId: entry.studentId,
      status: entry.status,
      notes: entry.notes || '',
    });
  }
  const uniqueEntries = Array.from(entryMap.values());

  const [allStudents, existingDateRecords] = await Promise.all([
    db.students.findAll(),
    db.attendance.findAll({ date: targetDate }),
  ]);

  const studentById = new Map<string, IStudent>(allStudents.map((s) => [s.id, s]));
  const existingByStudentId = new Map<string, IAttendanceRecord>();
  for (const rec of existingDateRecords) {
    if (rec.session === session) {
      existingByStudentId.set(rec.studentId, rec);
    }
  }

  for (const entry of uniqueEntries) {
    const student = studentById.get(entry.studentId);
    if (!student) {
      res.status(404).json({
        error: `Student record (${entry.studentId}) not found`,
        code: 'STUDENT_NOT_FOUND',
      });
      return;
    }
    if (student.status !== 'active') {
      res.status(422).json({
        error: `Cannot mark attendance for ${student.fullName}: student status is "${student.status}"`,
        code: 'STUDENT_NOT_ACTIVE',
      });
      return;
    }
  }

  const now = new Date().toISOString();
  let createdCount = 0;
  let updatedCount = 0;
  const savedRecords: IAttendanceRecord[] = [];

  for (const entry of uniqueEntries) {
    const student = studentById.get(entry.studentId)!;
    const existing = existingByStudentId.get(student.id);

    if (existing) {
      const updated = await db.attendance.updateById(existing.id, {
        status: entry.status,
        method: 'teacher_rollcall',
        checkInTime: now,
        notes: entry.notes,
        recordedBy: req.auth!.user.fullName,
        recordedById: req.auth!.user.id,
        updatedAt: now,
      });
      if (updated) savedRecords.push(updated);
      updatedCount += 1;
    } else {
      const created: IAttendanceRecord = {
        id: `att_${crypto.randomUUID().slice(0, 12)}`,
        studentId: student.id,
        studentCode: student.studentId,
        studentName: student.fullName,
        division: student.division,
        gradeLevel: student.gradeLevel,
        section: student.section,
        className: student.className,
        academicYear: student.academicYear,
        date: targetDate,
        session,
        status: entry.status,
        method: 'teacher_rollcall',
        checkInTime: now,
        qrTokenDigest: '',
        notes: entry.notes,
        recordedBy: req.auth!.user.fullName,
        recordedById: req.auth!.user.id,
        createdAt: now,
        updatedAt: now,
      };
      await db.attendance.create(created);
      savedRecords.push(created);
      createdCount += 1;
    }
  }

  const presentCount = uniqueEntries.filter((e) => e.status === 'present').length;
  const absentCount = uniqueEntries.filter((e) => e.status === 'absent').length;
  const lateCount = uniqueEntries.filter((e) => e.status === 'late').length;
  const excusedCount = uniqueEntries.filter((e) => e.status === 'excused').length;

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Teacher',
    action: 'ATTENDANCE_CLASS_ROLLCALL_SAVED',
    resourceType: 'attendance',
    details: {
      date: targetDate,
      session,
      processedCount: uniqueEntries.length,
      createdCount,
      updatedCount,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
    },
    severity: 'info',
  });

  const evaluated = await evaluateAbsenceWarnings({
    req,
    subjectType: 'student',
    subjectIds: uniqueEntries.map((e) => e.studentId),
  });

  res.status(200).json({
    date: targetDate,
    session,
    processedCount: uniqueEntries.length,
    createdCount,
    updatedCount,
    summary: {
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      excused: excusedCount,
    },
    records: savedRecords,
    triggeredWarnings: evaluated.newlyTriggered,
  });
}

export async function generateStudentQr(req: Request, res: Response) {
  const perms = req.auth!.effectivePermissions;
  const canViewQr =
    hasPermission(perms, 'attendance', 'view') || hasPermission(perms, 'students', 'view');

  if (!canViewQr) {
    res.status(403).json({ error: 'Missing permission to generate attendance QR codes' });
    return;
  }

  const student = await db.students.findById(req.params.studentId);
  if (!student) {
    res.status(404).json({ error: 'Student record not found' });
    return;
  }

  const allowedIds = getAuthorizedStudentIds(req, [student]);
  if (allowedIds && !allowedIds.has(student.id)) {
    res.status(403).json({ error: 'Access to this student QR code is restricted' });
    return;
  }

  if (student.status !== 'active') {
    res.status(422).json({
      error: `QR attendance codes can only be issued for active students (current status: ${student.status})`,
    });
    return;
  }

  const qrPayload = buildSignedStudentQrPayload(student);
  const qrDataUrl = await renderQrDataUrl(qrPayload);

  res.json({
    student: {
      id: student.id,
      studentId: student.studentId,
      admissionNumber: student.admissionNumber,
      fullName: student.fullName,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      division: student.division,
      gradeLevel: student.gradeLevel,
      section: student.section,
      className: student.className,
      academicYear: student.academicYear,
      photoUrl: student.photoUrl,
      guardianPhone: student.guardian?.phone || '',
    },
    qrPayload,
    qrDataUrl,
    issuedAt: new Date().toISOString(),
  });
}

export async function generateBatchStudentQr(req: Request, res: Response) {
  const perms = req.auth!.effectivePermissions;
  const canViewQr =
    hasPermission(perms, 'attendance', 'view') || hasPermission(perms, 'students', 'view');

  if (!canViewQr) {
    res.status(403).json({ error: 'Missing permission to generate attendance QR codes' });
    return;
  }

  const parsed = batchQrSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid QR filter parameters' });
    return;
  }

  const { gradeLevel, section, studentIds } = parsed.data;
  const allStudents = await db.students.findAll();
  const allowedIds = getAuthorizedStudentIds(req, allStudents);

  let targets = allStudents.filter((s) => s.status === 'active');
  if (allowedIds) {
    targets = targets.filter((s) => allowedIds.has(s.id));
  }
  if (studentIds && studentIds.length > 0) {
    const idSet = new Set(studentIds);
    targets = targets.filter((s) => idSet.has(s.id));
  }
  if (gradeLevel) {
    targets = targets.filter((s) => s.gradeLevel === gradeLevel);
  }
  if (section) {
    targets = targets.filter((s) => s.section.toUpperCase() === section.toUpperCase());
  }

  targets.sort(
    (a, b) => a.gradeLevel.localeCompare(b.gradeLevel) || a.fullName.localeCompare(b.fullName)
  );
  const limited = targets.slice(0, 100);

  const cards = await Promise.all(
    limited.map(async (student) => {
      const qrPayload = buildSignedStudentQrPayload(student);
      const qrDataUrl = await renderQrDataUrl(qrPayload);
      return {
        student: {
          id: student.id,
          studentId: student.studentId,
          admissionNumber: student.admissionNumber,
          fullName: student.fullName,
          gender: student.gender,
          dateOfBirth: student.dateOfBirth,
          division: student.division,
          gradeLevel: student.gradeLevel,
          section: student.section,
          className: student.className,
          academicYear: student.academicYear,
          photoUrl: student.photoUrl,
          guardianPhone: student.guardian?.phone || '',
        },
        qrPayload,
        qrDataUrl,
      };
    })
  );

  res.json({
    totalMatching: targets.length,
    cards,
    issuedAt: new Date().toISOString(),
  });
}

export async function recordAttendance(req: Request, res: Response) {
  const perms = req.auth!.effectivePermissions;
  const roleSlug = req.auth!.role?.slug;
  if (!canTakeAttendance(perms) || roleSlug === 'student' || roleSlug === 'parent') {
    res.status(403).json({ error: 'Only authorized teaching staff can record attendance' });
    return;
  }

  const parsed = recordAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid attendance recording request',
    });
    return;
  }

  const {
    qrPayload,
    studentId,
    studentCode,
    date,
    session,
    status,
    method,
    notes,
    overwriteIfExists,
  } = parsed.data;

  const targetDate = date || new Date().toISOString().slice(0, 10);
  let resolvedStudent: IStudent | null = null;
  let qrTokenDigest = '';

  if (qrPayload || method === 'qr_scan') {
    if (!qrPayload) {
      res.status(400).json({
        error: 'A signed student QR payload is required for QR attendance scanning',
        code: 'MISSING_QR_PAYLOAD',
      });
      return;
    }

    const verification = verifySignedStudentQrPayload(qrPayload);
    if (!verification.valid || !verification.studentId || !verification.studentCode) {
      await recordAuditLog({
        req,
        actorId: req.auth!.user.id,
        actorName: req.auth!.user.fullName,
        actorRole: req.auth!.role?.name || 'Staff',
        action: 'ATTENDANCE_QR_REJECTED',
        resourceType: 'attendance',
        details: { reason: verification.error, targetDate, session },
        severity: 'warning',
      });
      res.status(400).json({
        error: verification.error || 'Invalid student QR code',
        code: 'INVALID_QR_SIGNATURE',
      });
      return;
    }

    resolvedStudent = await db.students.findById(verification.studentId);
    if (!resolvedStudent) {
      res.status(404).json({
        error: 'Student record encoded in QR code was not found',
        code: 'STUDENT_NOT_FOUND',
      });
      return;
    }
    if (resolvedStudent.studentId.toUpperCase() !== verification.studentCode.toUpperCase()) {
      res.status(422).json({
        error: 'QR student identifier does not match current student record',
        code: 'QR_STUDENT_MISMATCH',
      });
      return;
    }
    qrTokenDigest = crypto.createHash('sha256').update(qrPayload).digest('hex').slice(0, 16);
  } else {
    if (studentId) {
      resolvedStudent = await db.students.findById(studentId);
    }
    if (!resolvedStudent && studentCode) {
      const normalizedCode = studentCode.trim().toUpperCase();
      const allStudents = await db.students.findAll();
      resolvedStudent =
        allStudents.find(
          (s) =>
            s.studentId.toUpperCase() === normalizedCode ||
            s.admissionNumber.toUpperCase() === normalizedCode
        ) || null;
    }
    if (!resolvedStudent) {
      res.status(404).json({
        error: 'Student record not found',
        code: 'STUDENT_NOT_FOUND',
      });
      return;
    }
  }

  if (resolvedStudent.status !== 'active') {
    res.status(422).json({
      error: `Cannot record attendance for ${resolvedStudent.fullName}: student status is "${resolvedStudent.status}"`,
      code: 'STUDENT_NOT_ACTIVE',
    });
    return;
  }

  const existingRecords = await db.attendance.findAll({
    studentId: resolvedStudent.id,
    date: targetDate,
  });
  const duplicate = existingRecords.find((r) => r.session === session);
  const now = new Date().toISOString();

  if (duplicate) {
    if (!overwriteIfExists) {
      res.status(409).json({
        error: `${resolvedStudent.fullName} (${resolvedStudent.studentId}) is already marked "${duplicate.status}" for ${targetDate} (${session})`,
        code: 'ALREADY_RECORDED',
        existingRecord: duplicate,
        student: {
          id: resolvedStudent.id,
          studentId: resolvedStudent.studentId,
          fullName: resolvedStudent.fullName,
          className: resolvedStudent.className,
        },
      });
      return;
    }

    const updated = await db.attendance.updateById(duplicate.id, {
      status,
      method,
      checkInTime: now,
      qrTokenDigest: qrTokenDigest || duplicate.qrTokenDigest,
      notes,
      recordedBy: req.auth!.user.fullName,
      recordedById: req.auth!.user.id,
      updatedAt: now,
    });

    await recordAuditLog({
      req,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.fullName,
      actorRole: req.auth!.role?.name || 'Staff',
      action: 'ATTENDANCE_UPDATED',
      resourceType: 'attendance',
      resourceId: duplicate.id,
      details: {
        studentId: resolvedStudent.studentId,
        date: targetDate,
        session,
        status,
        method,
      },
      severity: 'info',
    });

    const evalSingle = await evaluateAbsenceWarnings({
      req,
      subjectType: 'student',
      subjectIds: [resolvedStudent.id],
    });

    res.status(200).json({
      record: updated,
      updated: true,
      student: {
        id: resolvedStudent.id,
        studentId: resolvedStudent.studentId,
        fullName: resolvedStudent.fullName,
        className: resolvedStudent.className,
      },
      triggeredWarnings: evalSingle.newlyTriggered,
    });
    return;
  }

  const record: IAttendanceRecord = {
    id: `att_${crypto.randomUUID().slice(0, 12)}`,
    studentId: resolvedStudent.id,
    studentCode: resolvedStudent.studentId,
    studentName: resolvedStudent.fullName,
    division: resolvedStudent.division,
    gradeLevel: resolvedStudent.gradeLevel,
    section: resolvedStudent.section,
    className: resolvedStudent.className,
    academicYear: resolvedStudent.academicYear,
    date: targetDate,
    session,
    status,
    method,
    checkInTime: now,
    qrTokenDigest,
    notes,
    recordedBy: req.auth!.user.fullName,
    recordedById: req.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.attendance.create(record);

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'ATTENDANCE_RECORDED',
    resourceType: 'attendance',
    resourceId: record.id,
    details: {
      studentId: resolvedStudent.studentId,
      fullName: resolvedStudent.fullName,
      className: resolvedStudent.className,
      date: targetDate,
      session,
      status,
      method,
    },
    severity: 'info',
  });

  const evalCreated = await evaluateAbsenceWarnings({
    req,
    subjectType: 'student',
    subjectIds: [resolvedStudent.id],
  });

  res.status(201).json({
    record,
    updated: false,
    student: {
      id: resolvedStudent.id,
      studentId: resolvedStudent.studentId,
      fullName: resolvedStudent.fullName,
      className: resolvedStudent.className,
    },
    triggeredWarnings: evalCreated.newlyTriggered,
  });
}

export async function deleteAttendanceRecord(req: Request, res: Response) {
  const existing = await db.attendance.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Attendance record not found' });
    return;
  }

  await db.attendance.deleteById(existing.id);

  await evaluateAbsenceWarnings({
    req,
    subjectType: 'student',
    subjectIds: [existing.studentId],
  });

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'ATTENDANCE_DELETED',
    resourceType: 'attendance',
    resourceId: existing.id,
    details: {
      studentId: existing.studentCode,
      date: existing.date,
      session: existing.session,
    },
    severity: 'warning',
  });

  res.json({ success: true });
}

export async function getTeacherRollCall(req: Request, res: Response) {
  if (!canManageTeacherAttendance(req)) {
    res.status(403).json({
      error: 'Only Attendance Officers, HR, Principals, or Admins can manage teacher attendance',
    });
    return;
  }

  const rawDate = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const targetDate = rawDate || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    res.status(400).json({ error: 'Date must use YYYY-MM-DD format' });
    return;
  }

  const rawSession =
    typeof req.query.session === 'string' ? (req.query.session.trim() as AttendanceSession) : 'Morning';
  const session: AttendanceSession = VALID_SESSIONS.has(rawSession) ? rawSession : 'Morning';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const includeAllStaff = req.query.includeAllStaff === 'true';

  const [allUsers, allRoles, allDepts, dateRecords] = await Promise.all([
    db.users.findAll(),
    db.roles.findAll(),
    db.departments.findAll(),
    db.teacherAttendance.findAll({ date: targetDate }),
  ]);

  const roleById = new Map<string, IRole>(allRoles.map((r) => [r.id, r]));
  const deptById = new Map<string, IDepartment>(allDepts.map((d) => [d.id, d]));

  let teachers = (allUsers as IUser[]).filter((u) => {
    if (u.status !== 'active') return false;
    const r = roleById.get(u.roleId);
    if (r?.slug === 'student' || r?.slug === 'parent') return false;
    if (includeAllStaff) return true;
    return (
      u.roleId === 'role_teacher' ||
      r?.slug === 'teacher' ||
      (r?.name || '').toLowerCase().includes('teacher')
    );
  });

  if (search) {
    teachers = teachers.filter(
      (u) =>
        u.fullName.toLowerCase().includes(search) ||
        u.username.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search)
    );
  }

  teachers.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const sessionMap = new Map<string, ITeacherAttendanceRecord>();
  for (const rec of dateRecords) {
    if (rec.session === session) {
      sessionMap.set(rec.teacherId, rec);
    }
  }

  const roster = teachers.map((u) => {
    const existing = sessionMap.get(u.id);
    const r = roleById.get(u.roleId);
    const dept = u.departmentId ? deptById.get(u.departmentId) : null;
    return {
      teacher: {
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        roleName: r?.name || 'Teacher',
        departmentName: dept?.name || 'Academic Affairs',
      },
      currentStatus: existing ? existing.status : null,
      notes: existing ? existing.notes : '',
      recordId: existing ? existing.id : null,
      recordedBy: existing ? existing.recordedBy : null,
      updatedAt: existing ? existing.updatedAt : null,
    };
  });

  const marked = roster.filter((r) => r.currentStatus !== null).length;
  res.json({
    date: targetDate,
    session,
    roster,
    counts: {
      totalTeachers: roster.length,
      marked,
      unmarked: roster.length - marked,
      present: roster.filter((r) => r.currentStatus === 'present').length,
      absent: roster.filter((r) => r.currentStatus === 'absent').length,
      late: roster.filter((r) => r.currentStatus === 'late').length,
      excused: roster.filter((r) => r.currentStatus === 'excused').length,
    },
  });
}

export async function recordBulkTeacherAttendance(req: Request, res: Response) {
  if (!canManageTeacherAttendance(req)) {
    res.status(403).json({
      error: 'Only Attendance Officers, HR, Principals, or Admins can record teacher attendance',
    });
    return;
  }

  const parsed = teacherBulkAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid teacher attendance submission',
    });
    return;
  }

  const targetDate = parsed.data.date || new Date().toISOString().slice(0, 10);
  const session = parsed.data.session;

  const entryMap = new Map<
    string,
    { teacherId: string; status: ITeacherAttendanceRecord['status']; notes: string }
  >();
  for (const entry of parsed.data.entries) {
    entryMap.set(entry.teacherId, {
      teacherId: entry.teacherId,
      status: entry.status,
      notes: entry.notes || '',
    });
  }
  const uniqueEntries = Array.from(entryMap.values());

  const [allUsers, allDepts, existingDateRecords] = await Promise.all([
    db.users.findAll(),
    db.departments.findAll(),
    db.teacherAttendance.findAll({ date: targetDate }),
  ]);

  const userById = new Map<string, IUser>(allUsers.map((u) => [u.id, u]));
  const deptById = new Map<string, IDepartment>(allDepts.map((d) => [d.id, d]));
  const existingByTeacherId = new Map<string, ITeacherAttendanceRecord>();
  for (const rec of existingDateRecords) {
    if (rec.session === session) {
      existingByTeacherId.set(rec.teacherId, rec);
    }
  }

  for (const entry of uniqueEntries) {
    const teacher = userById.get(entry.teacherId);
    if (!teacher) {
      res.status(404).json({
        error: `Staff/teacher record (${entry.teacherId}) not found`,
        code: 'TEACHER_NOT_FOUND',
      });
      return;
    }
    if (teacher.status !== 'active') {
      res.status(422).json({
        error: `Cannot mark attendance for ${teacher.fullName}: account status is "${teacher.status}"`,
        code: 'TEACHER_NOT_ACTIVE',
      });
      return;
    }
  }

  const now = new Date().toISOString();
  let createdCount = 0;
  let updatedCount = 0;
  const savedRecords: ITeacherAttendanceRecord[] = [];

  for (const entry of uniqueEntries) {
    const teacher = userById.get(entry.teacherId)!;
    const deptName = teacher.departmentId
      ? deptById.get(teacher.departmentId)?.name || 'Academic Affairs'
      : 'Academic Affairs';
    const existing = existingByTeacherId.get(teacher.id);

    if (existing) {
      const updated = await db.teacherAttendance.updateById(existing.id, {
        status: entry.status,
        notes: entry.notes,
        recordedBy: req.auth!.user.fullName,
        recordedById: req.auth!.user.id,
        updatedAt: now,
      });
      if (updated) savedRecords.push(updated);
      updatedCount += 1;
    } else {
      const created: ITeacherAttendanceRecord = {
        id: `tatt_${crypto.randomUUID().slice(0, 12)}`,
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        teacherEmail: teacher.email,
        username: teacher.username,
        departmentName: deptName,
        date: targetDate,
        session,
        status: entry.status,
        notes: entry.notes,
        recordedBy: req.auth!.user.fullName,
        recordedById: req.auth!.user.id,
        createdAt: now,
        updatedAt: now,
      };
      await db.teacherAttendance.create(created);
      savedRecords.push(created);
      createdCount += 1;
    }
  }

  const presentCount = uniqueEntries.filter((e) => e.status === 'present').length;
  const absentCount = uniqueEntries.filter((e) => e.status === 'absent').length;
  const lateCount = uniqueEntries.filter((e) => e.status === 'late').length;
  const excusedCount = uniqueEntries.filter((e) => e.status === 'excused').length;

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Attendance Officer',
    action: 'TEACHER_ATTENDANCE_SAVED',
    resourceType: 'teacher_attendance',
    details: {
      date: targetDate,
      session,
      processedCount: uniqueEntries.length,
      createdCount,
      updatedCount,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
    },
    severity: 'info',
  });

  const evaluated = await evaluateAbsenceWarnings({
    req,
    subjectType: 'teacher',
    subjectIds: uniqueEntries.map((e) => e.teacherId),
  });

  res.status(200).json({
    date: targetDate,
    session,
    processedCount: uniqueEntries.length,
    createdCount,
    updatedCount,
    summary: {
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      excused: excusedCount,
    },
    records: savedRecords,
    triggeredWarnings: evaluated.newlyTriggered,
  });
}

export async function listAbsenceWarnings(req: Request, res: Response) {
  const { user, role, effectivePermissions: perms } = req.auth!;
  const roleSlug = role?.slug;
  if (roleSlug === 'student' || roleSlug === 'parent') {
    res.status(403).json({ error: 'Attendance follow-up warnings are restricted to school staff' });
    return;
  }

  const hasAccess =
    user.isSuperAdmin ||
    role?.isSuperAdminRole ||
    canViewAttendanceLog(perms) ||
    hasPermission(perms, 'teachers', 'view') ||
    hasPermission(perms, 'hr', 'manage');

  if (!hasAccess) {
    res.status(403).json({ error: 'Missing permission to view consecutive absence warnings' });
    return;
  }

  // Keep consecutive-absence warnings synchronized with current attendance logs
  await evaluateAbsenceWarnings({ subjectType: 'all' });

  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const subjectTypeFilter =
    typeof req.query.subjectType === 'string' ? req.query.subjectType.trim() : '';
  const severityFilter = typeof req.query.severity === 'string' ? req.query.severity.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let warnings = await db.absenceWarnings.findAll();

  // Regular classroom teachers inspect student absence warnings only
  if (roleSlug === 'teacher' && !user.isSuperAdmin && !hasPermission(perms, 'attendance', 'manage')) {
    warnings = warnings.filter((w) => w.subjectType === 'student');
  }

  const summary = {
    total: warnings.length,
    open: warnings.filter((w) => w.status === 'open').length,
    acknowledged: warnings.filter((w) => w.status === 'acknowledged').length,
    inProgress: warnings.filter((w) => w.status === 'in_progress').length,
    resolved: warnings.filter((w) => w.status === 'resolved' || w.status === 'dismissed').length,
    criticalOpen: warnings.filter(
      (w) =>
        w.severity === 'critical' &&
        (w.status === 'open' || w.status === 'acknowledged' || w.status === 'in_progress')
    ).length,
    studentActive: warnings.filter(
      (w) => w.subjectType === 'student' && w.status !== 'resolved' && w.status !== 'dismissed'
    ).length,
    teacherActive: warnings.filter(
      (w) => w.subjectType === 'teacher' && w.status !== 'resolved' && w.status !== 'dismissed'
    ).length,
  };

  if (statusFilter === 'active') {
    warnings = warnings.filter(
      (w) => w.status === 'open' || w.status === 'acknowledged' || w.status === 'in_progress'
    );
  } else if (statusFilter) {
    warnings = warnings.filter((w) => w.status === statusFilter);
  }
  if (subjectTypeFilter) {
    warnings = warnings.filter((w) => w.subjectType === subjectTypeFilter);
  }
  if (severityFilter) {
    warnings = warnings.filter((w) => w.severity === severityFilter);
  }
  if (search) {
    warnings = warnings.filter(
      (w) =>
        w.subjectName.toLowerCase().includes(search) ||
        w.subjectCode.toLowerCase().includes(search) ||
        w.subjectDetail.toLowerCase().includes(search)
    );
  }

  warnings.sort((a, b) => {
    const activeRank = (st: string) =>
      st === 'open' ? 0 : st === 'in_progress' ? 1 : st === 'acknowledged' ? 2 : 3;
    const rankDiff = activeRank(a.status) - activeRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return b.consecutiveDays - a.consecutiveDays || b.triggeredAt.localeCompare(a.triggeredAt);
  });

  res.json({ warnings, summary });
}

export async function scanAbsenceWarnings(req: Request, res: Response) {
  const { user, role, effectivePermissions: perms } = req.auth!;
  if (role?.slug === 'student' || role?.slug === 'parent') {
    res.status(403).json({ error: 'Access restricted' });
    return;
  }
  const allowed =
    user.isSuperAdmin ||
    role?.isSuperAdminRole ||
    canTakeAttendance(perms) ||
    hasPermission(perms, 'attendance', 'view') ||
    hasPermission(perms, 'teachers', 'view') ||
    hasPermission(perms, 'hr', 'manage');
  if (!allowed) {
    res.status(403).json({ error: 'Missing permission to scan absence warnings' });
    return;
  }

  const result = await evaluateAbsenceWarnings({ req, subjectType: 'all' });
  res.json({
    newlyTriggeredCount: result.newlyTriggered.length,
    updatedCount: result.updatedWarnings.length,
    autoResolvedCount: result.autoResolvedCount,
    newlyTriggered: result.newlyTriggered,
  });
}

export async function followUpAbsenceWarning(req: Request, res: Response) {
  const { user, role, effectivePermissions: perms } = req.auth!;
  const roleSlug = role?.slug;
  if (roleSlug === 'student' || roleSlug === 'parent') {
    res.status(403).json({ error: 'Students and parents cannot modify absence follow-up warnings' });
    return;
  }

  const canFollowUp =
    user.isSuperAdmin ||
    role?.isSuperAdminRole ||
    canTakeAttendance(perms) ||
    hasPermission(perms, 'attendance', 'approve') ||
    hasPermission(perms, 'teachers', 'manage') ||
    hasPermission(perms, 'hr', 'manage');

  if (!canFollowUp) {
    res.status(403).json({ error: 'Missing permission to record Attendance Officer follow-up actions' });
    return;
  }

  const existing = await db.absenceWarnings.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Absence warning not found' });
    return;
  }

  if (
    existing.subjectType === 'teacher' &&
    roleSlug === 'teacher' &&
    !user.isSuperAdmin &&
    !hasPermission(perms, 'attendance', 'manage')
  ) {
    res.status(403).json({ error: 'Teacher absence follow-ups require Attendance Officer or Admin access' });
    return;
  }

  const parsed = absenceWarningFollowUpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid follow-up payload',
    });
    return;
  }

  const { status, actionTaken, note, resolutionSummary } = parsed.data;
  const now = new Date().toISOString();

  const followUpEntry: AbsenceFollowUpEntry = {
    id: `fu_${crypto.randomUUID().slice(0, 10)}`,
    actionTaken,
    note,
    statusAfter: status,
    recordedBy: user.fullName,
    recordedById: user.id,
    timestamp: now,
  };

  const nextNotes = [followUpEntry, ...(existing.followUpNotes || [])];
  const isResolved = status === 'resolved' || status === 'dismissed';

  const updated = await db.absenceWarnings.updateById(existing.id, {
    status,
    followUpNotes: nextNotes,
    acknowledgedBy: existing.acknowledgedBy || user.fullName,
    acknowledgedAt: existing.acknowledgedAt || now,
    resolvedBy: isResolved ? user.fullName : null,
    resolvedAt: isResolved ? now : null,
    resolutionSummary: isResolved
      ? resolutionSummary || note || actionTaken
      : existing.resolutionSummary,
    updatedAt: now,
  });

  await recordAuditLog({
    req,
    actorId: user.id,
    actorName: user.fullName,
    actorRole: role?.name || 'Attendance Officer',
    action: 'ABSENCE_WARNING_FOLLOWUP',
    resourceType: 'absence_warning',
    resourceId: existing.id,
    details: {
      subjectType: existing.subjectType,
      subjectName: existing.subjectName,
      statusAfter: status,
      actionTaken,
    },
    severity: 'info',
  });

  res.json({ warning: updated });
}

