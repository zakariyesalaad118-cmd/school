export const SYSTEM_MODULES = [
  'overview',
  'users',
  'roles',
  'departments',
  'dashboards',
  'branding',
  'settings',
  'security',
  'audit',
  'students',
  'teachers',
  'academics',
  'attendance',
  'exams',
  'finance',
  'library',
  'transport',
  'hr',
  'reports',
] as const;

export type SystemModule = (typeof SYSTEM_MODULES)[number];

export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'reject',
  'export',
  'print',
  'manage',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type WidgetType =
  | 'kpi_users_summary'
  | 'kpi_roles_departments'
  | 'kpi_security_posture'
  | 'kpi_exams_summary'
  | 'chart_user_distribution'
  | 'chart_department_capacity'
  | 'chart_auth_activity'
  | 'chart_exam_performance'
  | 'table_recent_audit'
  | 'table_recent_logins'
  | 'table_recent_exam_results'
  | 'panel_quick_actions'
  | 'panel_school_identity'
  | 'panel_system_health'
  | 'panel_module_directory'
  | 'panel_exam_schedule';

export interface DashboardWidgetConfig {
  id: string;
  type: WidgetType;
  titleKey: string;
  enabled: boolean;
  order: number;
  span: 1 | 2 | 3;
}

export type UserStatus = 'active' | 'inactive' | 'suspended';
export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'en' | 'so';

export interface IUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  passwordHash: string;
  roleId: string;
  departmentId: string | null;
  customPermissions: string[];
  deniedPermissions: string[];
  status: UserStatus;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  themePreference: ThemePreference;
  languagePreference: LanguagePreference;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  lockUntil: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IRole {
  id: string;
  name: string;
  slug: string;
  description: string;
  departmentId: string | null;
  permissions: string[];
  modules: SystemModule[];
  isSystemRole: boolean;
  isSuperAdminRole: boolean;
  isActive: boolean;
  dashboardId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IDepartment {
  id: string;
  name: string;
  code: string;
  description: string;
  managerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IDashboardConfiguration {
  id: string;
  name: string;
  description: string;
  roleId: string | null;
  modules: SystemModule[];
  widgets: DashboardWidgetConfig[];
  assignedUserIds: string[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ISchoolSettings {
  id: string;
  osName: string;
  schoolName: string;
  slogan: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  defaultLanguage: LanguagePreference;
  defaultTheme: ThemePreference;
  loginHeadline: string;
  loginSubheadline: string;
  setupCompleted: boolean;
  updatedAt: string;
}

export interface ILoginHistory {
  id: string;
  userId: string | null;
  identifier: string;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failed' | 'locked';
  failureReason: string | null;
  timestamp: string;
}

export interface IAuditLog {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
}

export interface IPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  requestedByAdminId: string | null;
  createdAt: string;
}

export type PublicUser = Omit<IUser, 'passwordHash'>;

export type StudentStatus = 'active' | 'applicant' | 'transferred' | 'graduated' | 'archived';
export type StudentGender = 'male' | 'female';

export interface GuardianInfo {
  fullName: string;
  relationship: string;
  phone: string;
  email: string;
  occupation: string;
  address: string;
}

export interface EmergencyContact {
  fullName: string;
  relationship: string;
  phone: string;
}

export interface StudentHistoryEntry {
  id: string;
  type: 'admission' | 'promotion' | 'transfer' | 'graduation' | 'archive' | 'update';
  note: string;
  gradeLevel: string;
  section: string;
  academicYear: string;
  recordedBy: string;
  timestamp: string;
}

export interface IStudent {
  id: string;
  studentId: string;
  admissionNumber: string;
  fullName: string;
  gender: StudentGender;
  dateOfBirth: string;
  nationality: string;
  email: string;
  phone: string;
  address: string;
  photoUrl: string;
  division: 'Primary' | 'Secondary';
  gradeLevel: string;
  section: string;
  className: string;
  academicYear: string;
  admissionDate: string;
  previousSchool: string;
  medicalNotes: string;
  status: StudentStatus;
  guardian: GuardianInfo;
  emergencyContact: EmergencyContact;
  linkedUserId: string | null;
  linkedParentUserId: string | null;
  history: StudentHistoryEntry[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AcademicResultStatus = 'draft' | 'processed' | 'published';
export type AcademicResultOutcome = 'passed' | 'promoted_with_support' | 'retained';

export interface IAcademicResult {
  id: string;
  studentId: string;
  studentCode: string;
  academicYear: string;
  gradeLevel: string;
  section: string;
  term: 'Final' | 'Annual';
  averageScore: number;
  outcome: AcademicResultOutcome;
  status: AcademicResultStatus;
  remarks: string;
  processedBy: string;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type AttendanceSession = 'Morning' | 'Afternoon' | 'Full Day';
export type AttendanceMethod = 'teacher_rollcall' | 'manual' | 'qr_scan';

export interface IAttendanceRecord {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  division: 'Primary' | 'Secondary';
  gradeLevel: string;
  section: string;
  className: string;
  academicYear: string;
  date: string;
  session: AttendanceSession;
  status: AttendanceStatus;
  method: AttendanceMethod;
  checkInTime: string;
  qrTokenDigest: string;
  notes: string;
  recordedBy: string;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ITeacherAttendanceRecord {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  username: string;
  departmentName: string;
  date: string;
  session: AttendanceSession;
  status: AttendanceStatus;
  notes: string;
  recordedBy: string;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
}

export type AbsenceSubjectType = 'student' | 'teacher';
export type AbsenceWarningSeverity = 'warning' | 'critical';
export type AbsenceWarningStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'resolved'
  | 'dismissed';

export interface AbsenceFollowUpEntry {
  id: string;
  actionTaken: string;
  note: string;
  statusAfter: AbsenceWarningStatus;
  recordedBy: string;
  recordedById: string;
  timestamp: string;
}

export interface IAbsenceWarning {
  id: string;
  subjectType: AbsenceSubjectType;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectDetail: string;
  contactPhone: string;
  consecutiveDays: number;
  absentDates: string[];
  streakKey: string;
  severity: AbsenceWarningSeverity;
  status: AbsenceWarningStatus;
  message: string;
  followUpNotes: AbsenceFollowUpEntry[];
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionSummary: string;
  triggeredAt: string;
  lastEvaluatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ExamTerm = 'Term 1' | 'Term 2' | 'Midterm' | 'Final' | 'Annual';
export type ExamSessionStatus = 'scheduled' | 'ongoing' | 'completed' | 'published';
export type ExamScheduleStatus = 'scheduled' | 'completed' | 'cancelled';
export type ExamMarkStatus = 'draft' | 'submitted' | 'approved' | 'published';
export type ExamSittingStatus = 'sat' | 'absent' | 'excused';

export interface IExamSession {
  id: string;
  title: string;
  academicYear: string;
  term: ExamTerm;
  division: 'All' | 'Primary' | 'Secondary';
  startDate: string;
  endDate: string;
  status: ExamSessionStatus;
  description: string;
  createdBy: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface IExamSchedule {
  id: string;
  examSessionId: string | null;
  examTitle: string;
  academicYear: string;
  term: ExamTerm;
  division: 'Primary' | 'Secondary';
  gradeLevel: string;
  section: string;
  subjectName: string;
  subjectCode: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room: string;
  invigilatorId: string | null;
  invigilatorName: string;
  maxMarks: number;
  passMarks: number;
  status: ExamScheduleStatus;
  notes: string;
  createdBy: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface IExamMark {
  id: string;
  examScheduleId: string;
  examSessionId: string | null;
  examTitle: string;
  academicYear: string;
  term: ExamTerm;
  division: 'Primary' | 'Secondary';
  gradeLevel: string;
  section: string;
  subjectName: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  score: number;
  maxMarks: number;
  passMarks: number;
  percentage: number;
  gradeLetter: string;
  passed: boolean;
  attendanceStatus: ExamSittingStatus;
  status: ExamMarkStatus;
  remarks: string;
  enteredBy: string;
  enteredById: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

