import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { db } from '../config/database.ts';
import { recordAuditLog } from '../services/auditService.ts';
import type {
  IAcademicResult,
  IStudent,
  StudentHistoryEntry,
} from '../types/models.ts';
import { hasPermission } from '../utils/permissions.ts';
import {
  processAcademicResultsSchema,
  promoteStudentsSchema,
} from '../validators/schemas.ts';

export const PROMOTION_LADDER = [
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
] as const;

export interface GradeProgression {
  currentGrade: string;
  nextGrade: string;
  nextDivision: 'Primary' | 'Secondary';
  isGraduation: boolean;
  mapped: boolean;
}

export function getNextGradeProgression(currentGrade: string): GradeProgression {
  const idx = (PROMOTION_LADDER as readonly string[]).indexOf(currentGrade);
  if (idx === -1) {
    return {
      currentGrade,
      nextGrade: currentGrade,
      nextDivision: currentGrade.startsWith('Form') ? 'Secondary' : 'Primary',
      isGraduation: false,
      mapped: false,
    };
  }
  if (idx === PROMOTION_LADDER.length - 1) {
    return {
      currentGrade,
      nextGrade: 'Graduated',
      nextDivision: 'Secondary',
      isGraduation: true,
      mapped: true,
    };
  }
  const nextGrade = PROMOTION_LADDER[idx + 1];
  const nextDivision: 'Primary' | 'Secondary' = nextGrade.startsWith('Form')
    ? 'Secondary'
    : 'Primary';
  return {
    currentGrade,
    nextGrade,
    nextDivision,
    isGraduation: false,
    mapped: true,
  };
}

function buildClassName(gradeLevel: string, section: string): string {
  const sec = section.trim().toUpperCase() || 'A';
  return `${gradeLevel.trim()} - ${sec}`;
}

function isResultProcessed(result: IAcademicResult | undefined): boolean {
  return Boolean(result && (result.status === 'processed' || result.status === 'published'));
}

function indexBestResultsForYear(
  results: IAcademicResult[],
  academicYear: string
): Map<string, IAcademicResult> {
  const priority: Record<IAcademicResult['status'], number> = {
    published: 3,
    processed: 2,
    draft: 1,
  };
  const map = new Map<string, IAcademicResult>();
  for (const r of results) {
    if (r.academicYear !== academicYear) continue;
    const key = `${r.studentId}::${r.gradeLevel}`;
    const existing = map.get(key);
    if (!existing || priority[r.status] > priority[existing.status]) {
      map.set(key, r);
    }
  }
  return map;
}

export async function listAcademicResults(req: Request, res: Response) {
  const academicYear =
    typeof req.query.academicYear === 'string' ? req.query.academicYear.trim() : '';
  const gradeLevel = typeof req.query.gradeLevel === 'string' ? req.query.gradeLevel.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

  let results = await db.academicResults.findAll();

  const { user, role } = req.auth!;
  if (!user.isSuperAdmin && !role?.isSuperAdminRole && (role?.slug === 'student' || role?.slug === 'parent')) {
    const allStudents = await db.students.findAll();
    const allowedIds = new Set(
      allStudents
        .filter((s) =>
          role.slug === 'student' ? s.linkedUserId === user.id : s.linkedParentUserId === user.id
        )
        .map((s) => s.id)
    );
    results = results.filter((r) => allowedIds.has(r.studentId));
  }

  if (academicYear) results = results.filter((r) => r.academicYear === academicYear);
  if (gradeLevel) results = results.filter((r) => r.gradeLevel === gradeLevel);
  if (status) results = results.filter((r) => r.status === status);

  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ results });
}

export async function processAcademicResults(req: Request, res: Response) {
  const perms = req.auth!.effectivePermissions;
  const canProcess =
    hasPermission(perms, 'students', 'edit') ||
    hasPermission(perms, 'students', 'approve') ||
    hasPermission(perms, 'exams', 'edit') ||
    hasPermission(perms, 'exams', 'approve');

  if (!canProcess) {
    res.status(403).json({
      error: 'Missing permission to process student academic results',
      code: 'FORBIDDEN',
    });
    return;
  }

  const parsed = processAcademicResultsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid result payload' });
    return;
  }

  const { academicYear, term, entries } = parsed.data;
  const allStudents = await db.students.findAll();
  const studentMap = new Map(allStudents.map((s) => [s.id, s]));
  const existingResults = await db.academicResults.findAll({ academicYear });

  const now = new Date().toISOString();
  const savedResults: IAcademicResult[] = [];

  for (const entry of entries) {
    const student = studentMap.get(entry.studentId);
    if (!student) {
      res.status(404).json({ error: `Student ${entry.studentId} not found` });
      return;
    }

    const existing = existingResults.find(
      (r) =>
        r.studentId === student.id &&
        r.gradeLevel === student.gradeLevel &&
        r.term === term
    );

    if (existing) {
      const updated = await db.academicResults.updateById(existing.id, {
        studentCode: student.studentId,
        section: student.section,
        averageScore: entry.averageScore,
        outcome: entry.outcome,
        status: entry.status,
        remarks: entry.remarks,
        processedBy: entry.status === 'draft' ? existing.processedBy : req.auth!.user.fullName,
        processedAt: entry.status === 'draft' ? existing.processedAt : now,
        updatedAt: now,
      });
      if (updated) savedResults.push(updated);
    } else {
      const created: IAcademicResult = {
        id: `res_${crypto.randomUUID().slice(0, 12)}`,
        studentId: student.id,
        studentCode: student.studentId,
        academicYear,
        gradeLevel: student.gradeLevel,
        section: student.section,
        term,
        averageScore: entry.averageScore,
        outcome: entry.outcome,
        status: entry.status,
        remarks: entry.remarks,
        processedBy: entry.status === 'draft' ? '' : req.auth!.user.fullName,
        processedAt: entry.status === 'draft' ? null : now,
        createdAt: now,
        updatedAt: now,
      };
      await db.academicResults.create(created);
      savedResults.push(created);
    }
  }

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Staff',
    action: 'ACADEMIC_RESULTS_PROCESSED',
    resourceType: 'academic_result',
    details: { academicYear, term, count: savedResults.length },
    severity: 'info',
  });

  res.status(200).json({ results: savedResults });
}

export async function previewStudentPromotion(req: Request, res: Response) {
  const sourceAcademicYear =
    typeof req.query.sourceAcademicYear === 'string'
      ? req.query.sourceAcademicYear.trim()
      : '';
  const targetAcademicYear =
    typeof req.query.targetAcademicYear === 'string'
      ? req.query.targetAcademicYear.trim()
      : '';
  const sourceGradeLevel =
    typeof req.query.sourceGradeLevel === 'string'
      ? req.query.sourceGradeLevel.trim()
      : '';
  const sourceSection =
    typeof req.query.sourceSection === 'string'
      ? req.query.sourceSection.trim().toUpperCase()
      : '';

  if (!sourceAcademicYear) {
    res.status(400).json({ error: 'sourceAcademicYear query parameter is required' });
    return;
  }

  const allStudents = await db.students.findAll();
  const candidates = allStudents
    .filter((s) => {
      if (s.status !== 'active') return false;
      if (s.academicYear !== sourceAcademicYear) return false;
      if (sourceGradeLevel && s.gradeLevel !== sourceGradeLevel) return false;
      if (sourceSection && s.section.toUpperCase() !== sourceSection) return false;
      return true;
    })
    .sort((a, b) => a.gradeLevel.localeCompare(b.gradeLevel) || a.fullName.localeCompare(b.fullName));

  const allResults = await db.academicResults.findAll({ academicYear: sourceAcademicYear });
  const resultMap = indexBestResultsForYear(allResults, sourceAcademicYear);

  let readyToPromote = 0;
  let readyToGraduate = 0;
  let retainedCount = 0;
  let blockedUnprocessed = 0;

  const items = candidates.map((s) => {
    const progression = getNextGradeProgression(s.gradeLevel);
    const result = resultMap.get(`${s.id}::${s.gradeLevel}`);
    const processed = isResultProcessed(result);

    let readiness: 'ready_promote' | 'ready_graduate' | 'retained' | 'missing_results' | 'unmapped_grade';
    if (!progression.mapped) {
      readiness = 'unmapped_grade';
      blockedUnprocessed += 1;
    } else if (!processed) {
      readiness = 'missing_results';
      blockedUnprocessed += 1;
    } else if (result!.outcome === 'retained') {
      readiness = 'retained';
      retainedCount += 1;
    } else if (progression.isGraduation) {
      readiness = 'ready_graduate';
      readyToGraduate += 1;
    } else {
      readiness = 'ready_promote';
      readyToPromote += 1;
    }

    return {
      studentId: s.id,
      studentCode: s.studentId,
      fullName: s.fullName,
      division: s.division,
      currentGradeLevel: s.gradeLevel,
      section: s.section,
      className: s.className,
      academicYear: s.academicYear,
      nextGradeLevel: progression.nextGrade,
      nextDivision: progression.nextDivision,
      isGraduation: progression.isGraduation,
      readiness,
      result: result
        ? {
            id: result.id,
            averageScore: result.averageScore,
            outcome: result.outcome,
            status: result.status,
            processedAt: result.processedAt,
            processedBy: result.processedBy,
          }
        : null,
    };
  });

  res.json({
    sourceAcademicYear,
    targetAcademicYear,
    summary: {
      totalCandidates: items.length,
      readyToPromote,
      readyToGraduate,
      retainedCount,
      blockedUnprocessed,
    },
    candidates: items,
  });
}

export async function promoteStudents(req: Request, res: Response) {
  const parsed = promoteStudentsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid student promotion request',
    });
    return;
  }

  const {
    sourceAcademicYear,
    targetAcademicYear,
    sourceGradeLevel,
    sourceSection,
    studentIds,
    targetSection,
    skipRetained,
    note,
  } = parsed.data;

  const allStudents = await db.students.findAll();
  let targetedStudents: IStudent[] = [];

  if (studentIds && studentIds.length > 0) {
    const idSet = new Set(studentIds);
    targetedStudents = allStudents.filter((s) => idSet.has(s.id));

    if (targetedStudents.length !== idSet.size) {
      res.status(404).json({ error: 'One or more selected student records were not found' });
      return;
    }

    const invalidCohort = targetedStudents.filter(
      (s) => s.status !== 'active' || s.academicYear !== sourceAcademicYear
    );
    if (invalidCohort.length > 0) {
      res.status(400).json({
        error: `Only active students enrolled in ${sourceAcademicYear} can be promoted in this batch`,
        invalidStudentIds: invalidCohort.map((s) => s.studentId),
      });
      return;
    }
  } else {
    targetedStudents = allStudents.filter((s) => {
      if (s.status !== 'active') return false;
      if (s.academicYear !== sourceAcademicYear) return false;
      if (sourceGradeLevel && s.gradeLevel !== sourceGradeLevel) return false;
      if (sourceSection && s.section.toUpperCase() !== sourceSection.toUpperCase()) return false;
      return true;
    });
  }

  if (targetedStudents.length === 0) {
    res.status(400).json({
      error: `No active students found in ${sourceAcademicYear} matching the promotion criteria`,
    });
    return;
  }

  // Validation Step: Ensure end-of-year results are processed for every student in this promotion batch
  const allResults = await db.academicResults.findAll({ academicYear: sourceAcademicYear });
  const resultMap = indexBestResultsForYear(allResults, sourceAcademicYear);

  const blockedStudents = targetedStudents
    .map((student) => {
      const result = resultMap.get(`${student.id}::${student.gradeLevel}`);
      const progression = getNextGradeProgression(student.gradeLevel);
      if (!progression.mapped) {
        return {
          id: student.id,
          studentId: student.studentId,
          fullName: student.fullName,
          gradeLevel: student.gradeLevel,
          reason: `Grade level "${student.gradeLevel}" is outside the promotion ladder`,
          resultStatus: result?.status || 'missing',
        };
      }
      if (!isResultProcessed(result)) {
        return {
          id: student.id,
          studentId: student.studentId,
          fullName: student.fullName,
          gradeLevel: student.gradeLevel,
          reason: result
            ? `Academic result is still in "${result.status}" status and must be processed first`
            : `No processed ${sourceAcademicYear} academic result recorded for ${student.gradeLevel}`,
          resultStatus: result?.status || 'missing',
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (blockedStudents.length > 0) {
    await recordAuditLog({
      req,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.fullName,
      actorRole: req.auth!.role?.name || 'Admin',
      action: 'STUDENT_PROMOTION_BLOCKED',
      resourceType: 'student',
      details: {
        sourceAcademicYear,
        targetAcademicYear,
        blockedCount: blockedStudents.length,
        blockedCodes: blockedStudents.map((b) => b.studentId),
      },
      severity: 'warning',
    });

    res.status(422).json({
      error: `Promotion blocked: end-of-year academic results must be processed first (${blockedStudents.length} student(s) pending).`,
      code: 'RESULTS_NOT_PROCESSED',
      blockedStudents,
    });
    return;
  }

  const now = new Date().toISOString();
  const promoted: Array<{
    id: string;
    studentId: string;
    fullName: string;
    fromGrade: string;
    toGrade: string;
    className: string;
  }> = [];
  const graduated: Array<{
    id: string;
    studentId: string;
    fullName: string;
    fromGrade: string;
  }> = [];
  const retained: Array<{
    id: string;
    studentId: string;
    fullName: string;
    gradeLevel: string;
    skipped: boolean;
  }> = [];

  for (const student of targetedStudents) {
    const result = resultMap.get(`${student.id}::${student.gradeLevel}`)!;
    const progression = getNextGradeProgression(student.gradeLevel);
    const nextSection = (targetSection || student.section || 'A').toUpperCase();

    if (result.outcome === 'retained') {
      if (skipRetained) {
        retained.push({
          id: student.id,
          studentId: student.studentId,
          fullName: student.fullName,
          gradeLevel: student.gradeLevel,
          skipped: true,
        });
        continue;
      }

      const retainEntry: StudentHistoryEntry = {
        id: `hist_${crypto.randomUUID().slice(0, 8)}`,
        type: 'update',
        note:
          note ||
          `Retained in ${student.gradeLevel} for ${targetAcademicYear} (Average: ${result.averageScore}%)`,
        gradeLevel: student.gradeLevel,
        section: nextSection,
        academicYear: targetAcademicYear,
        recordedBy: req.auth!.user.fullName,
        timestamp: now,
      };

      await db.students.updateById(student.id, {
        section: nextSection,
        className: buildClassName(student.gradeLevel, nextSection),
        academicYear: targetAcademicYear,
        history: [retainEntry, ...(student.history || [])],
        updatedBy: req.auth!.user.id,
        updatedAt: now,
      });

      retained.push({
        id: student.id,
        studentId: student.studentId,
        fullName: student.fullName,
        gradeLevel: student.gradeLevel,
        skipped: false,
      });
      continue;
    }

    if (progression.isGraduation) {
      const gradEntry: StudentHistoryEntry = {
        id: `hist_${crypto.randomUUID().slice(0, 8)}`,
        type: 'graduation',
        note:
          note ||
          `Completed ${student.gradeLevel} (${sourceAcademicYear}) with ${result.averageScore}% average and graduated`,
        gradeLevel: student.gradeLevel,
        section: student.section,
        academicYear: sourceAcademicYear,
        recordedBy: req.auth!.user.fullName,
        timestamp: now,
      };

      await db.students.updateById(student.id, {
        status: 'graduated',
        history: [gradEntry, ...(student.history || [])],
        updatedBy: req.auth!.user.id,
        updatedAt: now,
      });

      graduated.push({
        id: student.id,
        studentId: student.studentId,
        fullName: student.fullName,
        fromGrade: student.gradeLevel,
      });
      continue;
    }

    const nextClassName = buildClassName(progression.nextGrade, nextSection);
    const promoEntry: StudentHistoryEntry = {
      id: `hist_${crypto.randomUUID().slice(0, 8)}`,
      type: 'promotion',
      note:
        note ||
        `Promoted from ${student.gradeLevel} (${sourceAcademicYear}) to ${progression.nextGrade} (${targetAcademicYear}) · Result: ${result.outcome} (${result.averageScore}%)`,
      gradeLevel: progression.nextGrade,
      section: nextSection,
      academicYear: targetAcademicYear,
      recordedBy: req.auth!.user.fullName,
      timestamp: now,
    };

    await db.students.updateById(student.id, {
      division: progression.nextDivision,
      gradeLevel: progression.nextGrade,
      section: nextSection,
      className: nextClassName,
      academicYear: targetAcademicYear,
      status: 'active',
      history: [promoEntry, ...(student.history || [])],
      updatedBy: req.auth!.user.id,
      updatedAt: now,
    });

    promoted.push({
      id: student.id,
      studentId: student.studentId,
      fullName: student.fullName,
      fromGrade: student.gradeLevel,
      toGrade: progression.nextGrade,
      className: nextClassName,
    });
  }

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'STUDENT_BATCH_PROMOTED',
    resourceType: 'student',
    details: {
      sourceAcademicYear,
      targetAcademicYear,
      sourceGradeLevel: sourceGradeLevel || 'ALL',
      promotedCount: promoted.length,
      graduatedCount: graduated.length,
      retainedCount: retained.length,
    },
    severity: 'warning',
  });

  res.json({
    summary: {
      sourceAcademicYear,
      targetAcademicYear,
      promotedCount: promoted.length,
      graduatedCount: graduated.length,
      retainedCount: retained.length,
    },
    promoted,
    graduated,
    retained,
  });
}
