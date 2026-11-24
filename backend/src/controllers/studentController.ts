import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { db } from '../config/database.ts';
import { recordAuditLog } from '../services/auditService.ts';
import type { IStudent, StudentHistoryEntry } from '../types/models.ts';
import { validateRasterLogoDataUrl } from '../utils/security.ts';
import {
  createStudentSchema,
  studentStatusChangeSchema,
  updateStudentSchema,
} from '../validators/schemas.ts';

const STUDENT_PHOTO_DIR = path.resolve(process.cwd(), 'backend', 'uploads', 'students');

function buildClassName(gradeLevel: string, section: string): string {
  const sec = section.trim().toUpperCase() || 'A';
  return `${gradeLevel.trim()} - ${sec}`;
}

async function generateUniqueCodes(academicYear: string): Promise<{
  studentId: string;
  admissionNumber: string;
}> {
  const existing = await db.students.findAll();
  const yearPart = (academicYear.match(/\d{4}/)?.[0] || String(new Date().getFullYear())).slice(0, 4);
  const usedIds = new Set(existing.map((s) => s.studentId.toUpperCase()));
  const usedAdm = new Set(existing.map((s) => s.admissionNumber.toUpperCase()));

  let seq = existing.length + 1;
  let studentId = '';
  let admissionNumber = '';
  do {
    const padded = String(seq).padStart(4, '0');
    studentId = `SPSS-${yearPart}-${padded}`;
    admissionNumber = `ADM-${yearPart}-${padded}`;
    seq += 1;
  } while (usedIds.has(studentId) || usedAdm.has(admissionNumber));

  return { studentId, admissionNumber };
}

function scopeAuthorizedStudents(req: Request, students: IStudent[]): IStudent[] {
  const { user, role } = req.auth!;
  if (user.isSuperAdmin || role?.isSuperAdminRole) {
    return students;
  }
  if (role?.slug === 'student') {
    return students.filter((s) => s.linkedUserId === user.id);
  }
  if (role?.slug === 'parent') {
    return students.filter((s) => s.linkedParentUserId === user.id);
  }
  return students;
}

export async function listStudents(req: Request, res: Response) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const division = typeof req.query.division === 'string' ? req.query.division.trim() : '';
  const gradeLevel = typeof req.query.gradeLevel === 'string' ? req.query.gradeLevel.trim() : '';
  const section = typeof req.query.section === 'string' ? req.query.section.trim().toUpperCase() : '';
  const gender = typeof req.query.gender === 'string' ? req.query.gender.trim() : '';
  const academicYear =
    typeof req.query.academicYear === 'string' ? req.query.academicYear.trim() : '';
  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

  const all = await db.students.findAll();
  const authorized = scopeAuthorizedStudents(req, all);

  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const newThisMonth = authorized.filter(
    (s) =>
      (s.admissionDate && s.admissionDate.startsWith(currentMonthPrefix)) ||
      (s.createdAt && s.createdAt.startsWith(currentMonthPrefix))
  ).length;

  const standardGrades = [
    'Grade 1',
    'Grade 2',
    'Grade 3',
    'Grade 4',
    'Grade 5',
    'Grade 6',
    'Grade 7',
    'Grade 8',
    'Form 1',
    'Form 2',
    'Form 3',
    'Form 4',
  ];
  const gradeSet = new Set(standardGrades);
  for (const s of authorized) {
    if (s.gradeLevel) gradeSet.add(s.gradeLevel);
  }
  const byGradeLevel = Array.from(gradeSet).map((grade) => {
    const matching = authorized.filter((s) => s.gradeLevel === grade);
    const shortLabel = grade.replace('Grade ', 'G').replace('Form ', 'F');
    return {
      gradeLevel: grade,
      shortLabel,
      active: matching.filter((s) => s.status === 'active').length,
      total: matching.length,
    };
  });

  const summary = {
    total: authorized.length,
    active: authorized.filter((s) => s.status === 'active').length,
    applicant: authorized.filter((s) => s.status === 'applicant').length,
    primary: authorized.filter((s) => s.division === 'Primary').length,
    secondary: authorized.filter((s) => s.division === 'Secondary').length,
    graduated: authorized.filter((s) => s.status === 'graduated').length,
    newThisMonth,
    byGradeLevel,
  };

  let filtered = authorized;

  if (search) {
    filtered = filtered.filter(
      (s) =>
        s.fullName.toLowerCase().includes(search) ||
        s.studentId.toLowerCase().includes(search) ||
        s.admissionNumber.toLowerCase().includes(search) ||
        s.guardian.fullName.toLowerCase().includes(search) ||
        s.guardian.phone.toLowerCase().includes(search) ||
        s.className.toLowerCase().includes(search)
    );
  }
  if (status) filtered = filtered.filter((s) => s.status === status);
  if (division) filtered = filtered.filter((s) => s.division === division);
  if (gradeLevel) filtered = filtered.filter((s) => s.gradeLevel === gradeLevel);
  if (section) filtered = filtered.filter((s) => s.section.toUpperCase() === section);
  if (gender) filtered = filtered.filter((s) => s.gender === gender);
  if (academicYear) filtered = filtered.filter((s) => s.academicYear === academicYear);

  filtered.sort((a, b) => {
    let valA = '';
    let valB = '';
    if (sortBy === 'fullName') {
      valA = a.fullName.toLowerCase();
      valB = b.fullName.toLowerCase();
    } else if (sortBy === 'studentId') {
      valA = a.studentId;
      valB = b.studentId;
    } else if (sortBy === 'gradeLevel') {
      valA = a.gradeLevel;
      valB = b.gradeLevel;
    } else if (sortBy === 'admissionDate') {
      valA = a.admissionDate;
      valB = b.admissionDate;
    } else {
      valA = a.createdAt;
      valB = b.createdAt;
    }
    const cmp = valA.localeCompare(valB);
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  const availableAcademicYears = Array.from(new Set(authorized.map((s) => s.academicYear))).sort();

  res.json({
    students: items,
    pagination: {
      page: safePage,
      pageSize,
      totalItems: totalFiltered,
      totalPages,
    },
    summary,
    facets: {
      academicYears: availableAcademicYears,
    },
  });
}

export async function getStudentById(req: Request, res: Response) {
  const student = await db.students.findById(req.params.id);
  if (!student) {
    res.status(404).json({ error: 'Student record not found' });
    return;
  }
  const allowed = scopeAuthorizedStudents(req, [student]);
  if (allowed.length === 0) {
    res.status(403).json({ error: 'Access to this student record is restricted' });
    return;
  }
  res.json({ student });
}

export async function createStudent(req: Request, res: Response) {
  const parsed = createStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid student data' });
    return;
  }

  const data = parsed.data;
  const autoCodes = await generateUniqueCodes(data.academicYear);
  const studentId = (data.studentId || autoCodes.studentId).toUpperCase();
  const admissionNumber = (data.admissionNumber || autoCodes.admissionNumber).toUpperCase();

  const existing = await db.students.findAll();
  if (existing.some((s) => s.studentId.toUpperCase() === studentId)) {
    res.status(409).json({ error: `Student ID ${studentId} is already assigned` });
    return;
  }
  if (existing.some((s) => s.admissionNumber.toUpperCase() === admissionNumber)) {
    res.status(409).json({ error: `Admission Number ${admissionNumber} already exists` });
    return;
  }

  const now = new Date().toISOString();
  const section = data.section.toUpperCase();
  const initialHistory: StudentHistoryEntry = {
    id: `hist_${crypto.randomUUID().slice(0, 8)}`,
    type: 'admission',
    note: data.status === 'applicant' ? 'Admission application submitted' : 'Student enrolled',
    gradeLevel: data.gradeLevel,
    section,
    academicYear: data.academicYear,
    recordedBy: req.auth!.user.fullName,
    timestamp: now,
  };

  const student: IStudent = {
    id: `stu_${crypto.randomUUID().slice(0, 12)}`,
    studentId,
    admissionNumber,
    fullName: data.fullName,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth,
    nationality: data.nationality,
    email: data.email.toLowerCase(),
    phone: data.phone,
    address: data.address,
    photoUrl: '',
    division: data.division,
    gradeLevel: data.gradeLevel,
    section,
    className: buildClassName(data.gradeLevel, section),
    academicYear: data.academicYear,
    admissionDate: data.admissionDate,
    previousSchool: data.previousSchool,
    medicalNotes: data.medicalNotes,
    status: data.status,
    guardian: data.guardian,
    emergencyContact: data.emergencyContact,
    linkedUserId: data.linkedUserId,
    linkedParentUserId: data.linkedParentUserId,
    history: [initialHistory],
    createdBy: req.auth!.user.id,
    updatedBy: req.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.students.create(student);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'STUDENT_CREATED',
    resourceType: 'student',
    resourceId: student.id,
    details: { studentId: student.studentId, fullName: student.fullName, className: student.className },
    severity: 'info',
  });

  res.status(201).json({ student });
}

export async function updateStudent(req: Request, res: Response) {
  const existing = await db.students.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Student record not found' });
    return;
  }

  const parsed = updateStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid student update' });
    return;
  }

  const data = parsed.data;
  const allStudents = await db.students.findAll();

  if (data.studentId && data.studentId.toUpperCase() !== existing.studentId) {
    if (allStudents.some((s) => s.id !== existing.id && s.studentId.toUpperCase() === data.studentId!.toUpperCase())) {
      res.status(409).json({ error: 'Student ID is already assigned to another student' });
      return;
    }
  }
  if (data.admissionNumber && data.admissionNumber.toUpperCase() !== existing.admissionNumber) {
    if (
      allStudents.some(
        (s) => s.id !== existing.id && s.admissionNumber.toUpperCase() === data.admissionNumber!.toUpperCase()
      )
    ) {
      res.status(409).json({ error: 'Admission Number is already assigned to another student' });
      return;
    }
  }

  const nextGrade = data.gradeLevel ?? existing.gradeLevel;
  const nextSection = (data.section ?? existing.section).toUpperCase();
  const nextAcademicYear = data.academicYear ?? existing.academicYear;
  const now = new Date().toISOString();

  const history = [...(existing.history || [])];
  if (data.gradeLevel !== undefined || data.section !== undefined || data.status !== undefined) {
    history.unshift({
      id: `hist_${crypto.randomUUID().slice(0, 8)}`,
      type: 'update',
      note: 'Student profile and class record updated',
      gradeLevel: nextGrade,
      section: nextSection,
      academicYear: nextAcademicYear,
      recordedBy: req.auth!.user.fullName,
      timestamp: now,
    });
  }

  const updates: Partial<IStudent> = {
    ...data,
    studentId: data.studentId ? data.studentId.toUpperCase() : existing.studentId,
    admissionNumber: data.admissionNumber ? data.admissionNumber.toUpperCase() : existing.admissionNumber,
    email: data.email !== undefined ? data.email.toLowerCase() : existing.email,
    section: nextSection,
    className: buildClassName(nextGrade, nextSection),
    history,
    updatedBy: req.auth!.user.id,
    updatedAt: now,
  };

  const updated = await db.students.updateById(existing.id, updates);

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'STUDENT_UPDATED',
    resourceType: 'student',
    resourceId: existing.id,
    details: { studentId: existing.studentId, updatedFields: Object.keys(data) },
    severity: 'info',
  });

  res.json({ student: updated });
}

export async function updateStudentStatus(req: Request, res: Response) {
  const existing = await db.students.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Student record not found' });
    return;
  }

  const parsed = studentStatusChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid status update' });
    return;
  }

  const data = parsed.data;
  const nextGrade = data.gradeLevel ?? existing.gradeLevel;
  const nextSection = (data.section ?? existing.section).toUpperCase();
  const nextAcademicYear = data.academicYear ?? existing.academicYear;
  const now = new Date().toISOString();

  let historyType: StudentHistoryEntry['type'] = 'update';
  if (data.gradeLevel && data.gradeLevel !== existing.gradeLevel) historyType = 'promotion';
  else if (data.status === 'transferred') historyType = 'transfer';
  else if (data.status === 'graduated') historyType = 'graduation';
  else if (data.status === 'archived') historyType = 'archive';

  const historyEntry: StudentHistoryEntry = {
    id: `hist_${crypto.randomUUID().slice(0, 8)}`,
    type: historyType,
    note: data.note || `Status updated to ${data.status}`,
    gradeLevel: nextGrade,
    section: nextSection,
    academicYear: nextAcademicYear,
    recordedBy: req.auth!.user.fullName,
    timestamp: now,
  };

  const updated = await db.students.updateById(existing.id, {
    status: data.status,
    gradeLevel: nextGrade,
    section: nextSection,
    className: buildClassName(nextGrade, nextSection),
    academicYear: nextAcademicYear,
    history: [historyEntry, ...(existing.history || [])],
    updatedBy: req.auth!.user.id,
    updatedAt: now,
  });

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'STUDENT_STATUS_CHANGED',
    resourceType: 'student',
    resourceId: existing.id,
    details: { studentId: existing.studentId, fromStatus: existing.status, toStatus: data.status },
    severity: 'warning',
  });

  res.json({ student: updated });
}

export async function uploadStudentPhoto(req: Request, res: Response) {
  const existing = await db.students.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Student record not found' });
    return;
  }

  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
  const check = validateRasterLogoDataUrl(dataUrl);
  if (!check.valid || !check.buffer || !check.ext) {
    res.status(400).json({ error: check.error || 'Invalid student photo' });
    return;
  }

  await fs.mkdir(STUDENT_PHOTO_DIR, { recursive: true });
  const filename = `student_${existing.id}_${crypto.randomUUID()}.${check.ext}`;
  const resolvedTarget = path.resolve(STUDENT_PHOTO_DIR, filename);
  if (!resolvedTarget.startsWith(STUDENT_PHOTO_DIR + path.sep)) {
    res.status(400).json({ error: 'Invalid upload path' });
    return;
  }

  await fs.writeFile(resolvedTarget, check.buffer);
  const photoUrl = `/uploads/students/${filename}`;

  const updated = await db.students.updateById(existing.id, {
    photoUrl,
    updatedBy: req.auth!.user.id,
    updatedAt: new Date().toISOString(),
  });

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'STUDENT_PHOTO_UPDATED',
    resourceType: 'student',
    resourceId: existing.id,
    severity: 'info',
  });

  res.json({ photoUrl, student: updated });
}

export async function deleteStudent(req: Request, res: Response) {
  const existing = await db.students.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Student record not found' });
    return;
  }

  await db.students.deleteById(existing.id);

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'STUDENT_DELETED',
    resourceType: 'student',
    resourceId: existing.id,
    details: { studentId: existing.studentId, fullName: existing.fullName },
    severity: 'warning',
  });

  res.json({ success: true });
}
