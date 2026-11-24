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

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'en' | 'so';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  username: string;
  roleId: string;
  roleName?: string;
  departmentId: string | null;
  departmentName?: string;
  customPermissions: string[];
  deniedPermissions: string[];
  status: UserStatus;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  themePreference: ThemePreference;
  languagePreference: LanguagePreference;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  departmentId: string | null;
  departmentName?: string | null;
  permissions: string[];
  modules: SystemModule[];
  isSystemRole: boolean;
  isSuperAdminRole: boolean;
  isActive: boolean;
  dashboardId: string | null;
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  managerId: string | null;
  managerName?: string | null;
  staffCount?: number;
  roleCount?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardConfiguration {
  id: string;
  name: string;
  description: string;
  roleId: string | null;
  roleName?: string;
  modules: SystemModule[];
  widgets: DashboardWidgetConfig[];
  assignedUserIds: string[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolSettings {
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

export interface LoginHistoryEntry {
  id: string;
  userId: string | null;
  identifier: string;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failed' | 'locked';
  failureReason: string | null;
  timestamp: string;
}

export interface AuditLogEntry {
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

export interface WidgetCatalogEntry {
  type: WidgetType;
  titleKey: string;
  descriptionKey: string;
  requiredPermission: { module: SystemModule; action: PermissionAction };
  defaultSpan: 1 | 2 | 3;
}

export interface DashboardTelemetry {
  counts: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    superAdmins: number;
    totalRoles: number;
    activeRoles: number;
    totalDepartments: number;
    activeDepartments: number;
    failedLogins24h: number;
  };
  roleDistribution: Array<{ name: string; count: number }>;
  departmentCapacity: Array<{ code: string; name: string; staffCount: number; roleCount: number }>;
  authActivitySeries: Array<{ day: string; success: number; failed: number }>;
  recentLogins: LoginHistoryEntry[];
  recentAudit: AuditLogEntry[];
  examTelemetry?: ExamDashboardTelemetry | null;
  schoolSettings: SchoolSettings;
  systemHealth: {
    databaseEngine: 'mongodb' | 'local-store';
    uptimeSeconds: number;
    memoryMb: number;
    nodeVersion: string;
  } | null;
}

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

export interface StudentRecord {
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
  createdAt: string;
  updatedAt: string;
}

export interface StudentListResponse {
  students: StudentRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  summary: {
    total: number;
    active: number;
    applicant: number;
    primary: number;
    secondary: number;
    graduated: number;
    newThisMonth: number;
    byGradeLevel: Array<{
      gradeLevel: string;
      shortLabel: string;
      active: number;
      total: number;
    }>;
  };
  facets: {
    academicYears: string[];
  };
}

export type AcademicResultStatus = 'draft' | 'processed' | 'published';
export type AcademicResultOutcome = 'passed' | 'promoted_with_support' | 'retained';
export type PromotionReadiness =
  | 'ready_promote'
  | 'ready_graduate'
  | 'retained'
  | 'missing_results'
  | 'unmapped_grade';

export interface PromotionCandidate {
  studentId: string;
  studentCode: string;
  fullName: string;
  division: 'Primary' | 'Secondary';
  currentGradeLevel: string;
  section: string;
  className: string;
  academicYear: string;
  nextGradeLevel: string;
  nextDivision: 'Primary' | 'Secondary';
  isGraduation: boolean;
  readiness: PromotionReadiness;
  result: {
    id: string;
    averageScore: number;
    outcome: AcademicResultOutcome;
    status: AcademicResultStatus;
    processedAt: string | null;
    processedBy: string;
  } | null;
}

export interface PromotionPreviewResponse {
  sourceAcademicYear: string;
  targetAcademicYear: string;
  summary: {
    totalCandidates: number;
    readyToPromote: number;
    readyToGraduate: number;
    retainedCount: number;
    blockedUnprocessed: number;
  };
  candidates: PromotionCandidate[];
}

export interface PromoteStudentsResponse {
  summary: {
    sourceAcademicYear: string;
    targetAcademicYear: string;
    promotedCount: number;
    graduatedCount: number;
    retainedCount: number;
  };
  promoted: Array<{
    id: string;
    studentId: string;
    fullName: string;
    fromGrade: string;
    toGrade: string;
    className: string;
  }>;
  graduated: Array<{
    id: string;
    studentId: string;
    fullName: string;
    fromGrade: string;
  }>;
  retained: Array<{
    id: string;
    studentId: string;
    fullName: string;
    gradeLevel: string;
    skipped: boolean;
  }>;
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type AttendanceSession = 'Morning' | 'Afternoon' | 'Full Day';
export type AttendanceMethod = 'teacher_rollcall' | 'manual' | 'qr_scan';

export interface AttendanceRecord {
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

export interface AttendanceListResponse {
  records: AttendanceRecord[];
  summary: {
    totalLogged: number;
    markedStudents?: number;
    unmarkedActiveStudents?: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    attendanceRate?: number;
    qrScans?: number;
    totalActiveStudents: number;
  };
  facets: {
    dates: string[];
  };
}

export interface RollCallRosterItem {
  student: {
    id: string;
    studentId: string;
    fullName: string;
    division: 'Primary' | 'Secondary';
    gradeLevel: string;
    section: string;
    className: string;
    academicYear: string;
    photoUrl: string;
    gender: StudentGender;
  };
  currentStatus: AttendanceStatus | null;
  notes: string;
  recordId: string | null;
  recordedBy: string | null;
  updatedAt: string | null;
}

export interface RollCallResponse {
  date: string;
  session: AttendanceSession;
  roster: RollCallRosterItem[];
  counts: {
    totalStudents: number;
    marked: number;
    unmarked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}

export interface BulkAttendanceSaveResponse {
  date: string;
  session: AttendanceSession;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  summary: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
  records: AttendanceRecord[];
  triggeredWarnings?: AbsenceWarning[];
}

export interface TeacherRollCallRosterItem {
  teacher: {
    id: string;
    fullName: string;
    username: string;
    email: string;
    roleName: string;
    departmentName: string;
  };
  currentStatus: AttendanceStatus | null;
  notes: string;
  recordId: string | null;
  recordedBy: string | null;
  updatedAt: string | null;
}

export interface TeacherRollCallResponse {
  date: string;
  session: AttendanceSession;
  roster: TeacherRollCallRosterItem[];
  counts: {
    totalTeachers: number;
    marked: number;
    unmarked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}

export interface TeacherBulkAttendanceSaveResponse {
  date: string;
  session: AttendanceSession;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  summary: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
  triggeredWarnings?: AbsenceWarning[];
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

export interface AbsenceWarning {
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

export interface AbsenceWarningsResponse {
  warnings: AbsenceWarning[];
  summary: {
    total: number;
    open: number;
    acknowledged: number;
    inProgress: number;
    resolved: number;
    criticalOpen: number;
    studentActive: number;
    teacherActive: number;
  };
}

export interface StudentQrCard {
  student: {
    id: string;
    studentId: string;
    admissionNumber?: string;
    fullName: string;
    gender?: StudentGender;
    dateOfBirth?: string;
    division: 'Primary' | 'Secondary';
    gradeLevel: string;
    section: string;
    className: string;
    academicYear: string;
    photoUrl: string;
    guardianPhone?: string;
  };
  qrPayload: string;
  qrDataUrl: string;
}

export type ExamTerm = 'Term 1' | 'Term 2' | 'Midterm' | 'Final' | 'Annual';
export type ExamSessionStatus = 'scheduled' | 'ongoing' | 'completed' | 'published';
export type ExamScheduleStatus = 'scheduled' | 'completed' | 'cancelled';
export type ExamMarkStatus = 'draft' | 'submitted' | 'approved' | 'published';
export type ExamSittingStatus = 'sat' | 'absent' | 'excused';

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

export interface ExamSessionRecord {
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

export interface ExamScheduleRecord {
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
  eligibleStudentsCount?: number;
  gradedCount?: number;
  publishedCount?: number;
  averagePercentage?: number | null;
}

export interface ExamMarkRecord {
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

export interface ExamMarksRosterItem {
  student: {
    id: string;
    studentId: string;
    fullName: string;
    division: 'Primary' | 'Secondary';
    gradeLevel: string;
    section: string;
    className: string;
    photoUrl: string;
  };
  mark: ExamMarkRecord | null;
}

export interface ExamMarksRosterResponse {
  schedule: ExamScheduleRecord;
  roster: ExamMarksRosterItem[];
  summary: {
    totalStudents: number;
    enteredCount: number;
    publishedCount: number;
    approvedCount: number;
    submittedCount: number;
    draftCount: number;
  };
}

export interface ExamInvigilatorOption {
  id: string;
  fullName: string;
  roleName: string;
}

export interface ExamOverviewResponse {
  telemetry: ExamDashboardTelemetry | null;
  sessions: ExamSessionRecord[];
  invigilators: ExamInvigilatorOption[];
}




