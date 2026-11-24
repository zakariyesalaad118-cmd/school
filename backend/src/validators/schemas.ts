import { z } from 'zod';
import { SYSTEM_MODULES, type WidgetType } from '../types/models.ts';

const WIDGET_TYPES: [WidgetType, ...WidgetType[]] = [
  'kpi_users_summary',
  'kpi_roles_departments',
  'kpi_security_posture',
  'kpi_exams_summary',
  'chart_user_distribution',
  'chart_department_capacity',
  'chart_auth_activity',
  'chart_exam_performance',
  'table_recent_audit',
  'table_recent_logins',
  'table_recent_exam_results',
  'panel_quick_actions',
  'panel_school_identity',
  'panel_system_health',
  'panel_module_directory',
  'panel_exam_schedule',
];

export const passwordPolicySchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long')
  .max(128)
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter')
  .regex(/[0-9]/, 'Password must include at least one number');

export const bootstrapSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may contain letters, numbers, dots, underscores, and hyphens'),
  password: passwordPolicySchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required').max(160),
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordPolicySchema,
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1).max(160),
});

export const resetPasswordTokenSchema = z.object({
  token: z.string().trim().min(16).max(200),
  newPassword: passwordPolicySchema,
});

export const updatePreferencesSchema = z.object({
  themePreference: z.enum(['system', 'light', 'dark']).optional(),
  languagePreference: z.enum(['en', 'so']).optional(),
});

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/),
  temporaryPassword: passwordPolicySchema,
  roleId: z.string().trim().min(1),
  departmentId: z.string().trim().nullable().optional(),
  customPermissions: z.array(z.string()).optional(),
  deniedPermissions: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  isSuperAdmin: z.boolean().optional(),
  reauthPassword: z.string().optional(),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(160).optional(),
  roleId: z.string().trim().min(1).optional(),
  departmentId: z.string().trim().nullable().optional(),
  customPermissions: z.array(z.string()).optional(),
  deniedPermissions: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  isSuperAdmin: z.boolean().optional(),
  reauthPassword: z.string().optional(),
});

export const adminResetUserPasswordSchema = z.object({
  temporaryPassword: passwordPolicySchema,
  reauthPassword: z.string().optional(),
});

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().default(''),
  departmentId: z.string().trim().nullable().optional().default(null),
  permissions: z.array(z.string()).default([]),
  modules: z.array(z.enum(SYSTEM_MODULES)).default(['overview']),
  isActive: z.boolean().optional().default(true),
  dashboardId: z.string().trim().nullable().optional().default(null),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().trim().max(300).optional().default(''),
  managerId: z.string().trim().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
});

export const dashboardWidgetSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(WIDGET_TYPES),
  titleKey: z.string().trim().min(1),
  enabled: z.boolean(),
  order: z.number().int().min(0),
  span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const dashboardConfigSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional().default(''),
  roleId: z.string().trim().nullable().optional().default(null),
  modules: z.array(z.enum(SYSTEM_MODULES)).default(['overview']),
  widgets: z.array(dashboardWidgetSchema).default([]),
  assignedUserIds: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid 6-digit hex color');

export const brandingUpdateSchema = z.object({
  osName: z.string().trim().min(2).max(80).optional(),
  schoolName: z.string().trim().min(2).max(140).optional(),
  slogan: z.string().trim().max(200).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().email().or(z.literal('')).optional(),
  website: z.string().trim().max(160).optional(),
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  defaultLanguage: z.enum(['en', 'so']).optional(),
  defaultTheme: z.enum(['system', 'light', 'dark']).optional(),
  loginHeadline: z.string().trim().max(160).optional(),
  loginSubheadline: z.string().trim().max(220).optional(),
});

export const guardianSchema = z.object({
  fullName: z.string().trim().min(2, 'Guardian full name is required').max(120),
  relationship: z.string().trim().min(2, 'Guardian relationship is required').max(60),
  phone: z.string().trim().min(6, 'Guardian phone number is required').max(40),
  email: z.string().trim().email('Invalid guardian email').or(z.literal('')).optional().default(''),
  occupation: z.string().trim().max(80).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
});

export const emergencyContactSchema = z.object({
  fullName: z.string().trim().max(120).optional().default(''),
  relationship: z.string().trim().max(60).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
});

export const createStudentSchema = z.object({
  studentId: z.string().trim().max(40).optional().default(''),
  admissionNumber: z.string().trim().max(40).optional().default(''),
  fullName: z.string().trim().min(2, 'Student full name is required').max(120),
  gender: z.enum(['male', 'female']),
  dateOfBirth: z.string().trim().min(4, 'Date of birth is required').max(30),
  nationality: z.string().trim().max(60).optional().default('Somali'),
  email: z.string().trim().email('Invalid student email').or(z.literal('')).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  division: z.enum(['Primary', 'Secondary']),
  gradeLevel: z.string().trim().min(1, 'Grade level is required').max(40),
  section: z.string().trim().min(1).max(10).optional().default('A'),
  academicYear: z.string().trim().min(4, 'Academic year is required').max(20),
  admissionDate: z.string().trim().min(4, 'Admission date is required').max(30),
  previousSchool: z.string().trim().max(120).optional().default(''),
  medicalNotes: z.string().trim().max(400).optional().default(''),
  status: z.enum(['active', 'applicant', 'transferred', 'graduated', 'archived']).optional().default('active'),
  guardian: guardianSchema,
  emergencyContact: emergencyContactSchema.optional().default({ fullName: '', relationship: '', phone: '' }),
  linkedUserId: z.string().trim().nullable().optional().default(null),
  linkedParentUserId: z.string().trim().nullable().optional().default(null),
});

export const updateStudentSchema = createStudentSchema.partial();

export const studentStatusChangeSchema = z.object({
  status: z.enum(['active', 'applicant', 'transferred', 'graduated', 'archived']),
  gradeLevel: z.string().trim().max(40).optional(),
  section: z.string().trim().max(10).optional(),
  academicYear: z.string().trim().max(20).optional(),
  note: z.string().trim().max(250).optional().default(''),
});

const academicYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, 'Academic year must use YYYY-YYYY format')
  .refine((val) => {
    const [start, end] = val.split('-').map(Number);
    return end === start + 1;
  }, 'Academic year must span two consecutive years');

export const processAcademicResultsSchema = z.object({
  academicYear: academicYearSchema,
  term: z.enum(['Final', 'Annual']).optional().default('Final'),
  entries: z
    .array(
      z.object({
        studentId: z.string().trim().min(1).max(60),
        averageScore: z.number().min(0).max(100),
        outcome: z.enum(['passed', 'promoted_with_support', 'retained']),
        status: z.enum(['draft', 'processed', 'published']).optional().default('processed'),
        remarks: z.string().trim().max(240).optional().default(''),
      })
    )
    .min(1, 'At least one student result entry is required')
    .max(300),
});

export const promoteStudentsSchema = z
  .object({
    sourceAcademicYear: academicYearSchema,
    targetAcademicYear: academicYearSchema,
    sourceGradeLevel: z.string().trim().max(40).optional().default(''),
    sourceSection: z
      .string()
      .trim()
      .max(10)
      .regex(/^[A-Za-z0-9]*$/, 'Section must be alphanumeric')
      .optional()
      .default(''),
    studentIds: z.array(z.string().trim().min(1).max(60)).max(300).optional(),
    targetSection: z
      .string()
      .trim()
      .max(10)
      .regex(/^[A-Za-z0-9]*$/, 'Target section must be alphanumeric')
      .optional()
      .default(''),
    skipRetained: z.boolean().optional().default(true),
    note: z.string().trim().max(250).optional().default(''),
  })
  .refine((data) => data.sourceAcademicYear !== data.targetAcademicYear, {
    message: 'Target academic year must be different from source academic year',
    path: ['targetAcademicYear'],
  });

export const batchQrSchema = z.object({
  gradeLevel: z.string().trim().max(40).optional().default(''),
  section: z
    .string()
    .trim()
    .max(10)
    .regex(/^[A-Za-z0-9]*$/)
    .optional()
    .default(''),
  studentIds: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
});

export const recordAttendanceSchema = z
  .object({
    qrPayload: z.string().trim().max(300).optional().default(''),
    studentId: z.string().trim().max(60).optional().default(''),
    studentCode: z.string().trim().max(40).optional().default(''),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
      .optional(),
    session: z.enum(['Morning', 'Afternoon', 'Full Day']).optional().default('Morning'),
    status: z.enum(['present', 'late', 'absent', 'excused']).optional().default('present'),
    method: z.enum(['teacher_rollcall', 'manual', 'qr_scan']).optional().default('teacher_rollcall'),
    notes: z.string().trim().max(240).optional().default(''),
    overwriteIfExists: z.boolean().optional().default(false),
  })
  .refine(
    (data) => Boolean(data.qrPayload || data.studentId || data.studentCode),
    'Either a student identifier or payload is required'
  );

export const bulkAttendanceSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
    .optional(),
  session: z.enum(['Morning', 'Afternoon', 'Full Day']).optional().default('Morning'),
  entries: z
    .array(
      z.object({
        studentId: z.string().trim().min(1).max(60),
        status: z.enum(['present', 'late', 'absent', 'excused']),
        notes: z.string().trim().max(240).optional().default(''),
      })
    )
    .min(1, 'Select at least one student to record attendance')
    .max(200),
});

export const teacherBulkAttendanceSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
    .optional(),
  session: z.enum(['Morning', 'Afternoon', 'Full Day']).optional().default('Morning'),
  entries: z
    .array(
      z.object({
        teacherId: z.string().trim().min(1).max(60),
        status: z.enum(['present', 'late', 'absent', 'excused']),
        notes: z.string().trim().max(240).optional().default(''),
      })
    )
    .min(1, 'Select at least one teacher to record attendance')
    .max(200),
});

export const absenceWarningFollowUpSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed']),
  actionTaken: z.string().trim().min(2, 'Describe the follow-up action taken').max(120),
  note: z.string().trim().max(500).optional().default(''),
  resolutionSummary: z.string().trim().max(300).optional().default(''),
});

const examTermSchema = z.enum(['Term 1', 'Term 2', 'Midterm', 'Final', 'Annual']);
const isoDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');
const timeSchema = z.string().trim().regex(/^\d{2}:\d{2}$/, 'Time must use HH:MM format');

export const examSessionSchema = z
  .object({
    title: z.string().trim().min(2, 'Exam session title is required').max(120),
    academicYear: academicYearSchema,
    term: examTermSchema,
    division: z.enum(['All', 'Primary', 'Secondary']).optional().default('All'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    status: z.enum(['scheduled', 'ongoing', 'completed', 'published']).optional().default('scheduled'),
    description: z.string().trim().max(300).optional().default(''),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

export const examScheduleSchema = z
  .object({
    examSessionId: z.string().trim().nullable().optional().default(null),
    examTitle: z.string().trim().min(2, 'Exam title is required').max(120),
    academicYear: academicYearSchema,
    term: examTermSchema,
    division: z.enum(['Primary', 'Secondary']),
    gradeLevel: z.string().trim().min(1, 'Grade / form level is required').max(40),
    section: z.string().trim().min(1).max(20).optional().default('All'),
    subjectName: z.string().trim().min(2, 'Subject name is required').max(80),
    subjectCode: z.string().trim().max(20).optional().default(''),
    examDate: isoDateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    room: z.string().trim().min(1, 'Exam room or hall is required').max(60),
    invigilatorId: z.string().trim().nullable().optional().default(null),
    invigilatorName: z.string().trim().max(100).optional().default(''),
    maxMarks: z.number().min(1).max(1000).optional().default(100),
    passMarks: z.number().min(0).max(1000).optional().default(50),
    status: z.enum(['scheduled', 'completed', 'cancelled']).optional().default('scheduled'),
    notes: z.string().trim().max(300).optional().default(''),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  })
  .refine((d) => d.passMarks <= d.maxMarks, {
    message: 'Pass marks cannot exceed max marks',
    path: ['passMarks'],
  });

export const bulkExamMarksSchema = z.object({
  submitStatus: z.enum(['draft', 'submitted']).optional().default('submitted'),
  entries: z
    .array(
      z.object({
        studentId: z.string().trim().min(1).max(60),
        score: z.number().min(0).max(1000),
        attendanceStatus: z.enum(['sat', 'absent', 'excused']).optional().default('sat'),
        remarks: z.string().trim().max(240).optional().default(''),
      })
    )
    .min(1, 'Provide at least one student mark entry')
    .max(300),
});

export const publishExamMarksSchema = z.object({
  examScheduleId: z.string().trim().min(1).max(80),
  action: z.enum(['approve', 'publish', 'return_draft']),
  syncAnnualResults: z.boolean().optional().default(true),
});


