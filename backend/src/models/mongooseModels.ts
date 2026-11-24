import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema(
  {
    _id: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    roleId: { type: String, required: true, index: true },
    departmentId: { type: String, default: null, index: true },
    customPermissions: { type: [String], default: [] },
    deniedPermissions: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', index: true },
    isSuperAdmin: { type: Boolean, default: false, index: true },
    mustChangePassword: { type: Boolean, default: false },
    themePreference: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    languagePreference: { type: String, enum: ['en', 'so'], default: 'en' },
    lastLoginAt: { type: String, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: String, default: null },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

const RoleSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, default: '' },
    departmentId: { type: String, default: null },
    permissions: { type: [String], default: [] },
    modules: { type: [String], default: [] },
    isSystemRole: { type: Boolean, default: false },
    isSuperAdminRole: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    dashboardId: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

const DepartmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, default: '' },
    managerId: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

const DashboardWidgetSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    titleKey: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, required: true },
    span: { type: Number, enum: [1, 2, 3], default: 1 },
  },
  { _id: false }
);

const DashboardConfigurationSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    roleId: { type: String, default: null, index: true },
    modules: { type: [String], default: [] },
    widgets: { type: [DashboardWidgetSchema], default: [] },
    assignedUserIds: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

const SchoolSettingsSchema = new Schema(
  {
    _id: { type: String, required: true },
    osName: { type: String, required: true },
    schoolName: { type: String, required: true },
    slogan: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#0F4C81' },
    secondaryColor: { type: String, default: '#1E3A5F' },
    accentColor: { type: String, default: '#059669' },
    defaultLanguage: { type: String, enum: ['en', 'so'], default: 'en' },
    defaultTheme: { type: String, enum: ['system', 'light', 'dark'], default: 'light' },
    loginHeadline: { type: String, default: '' },
    loginSubheadline: { type: String, default: '' },
    setupCompleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

const LoginHistorySchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, default: null, index: true },
    identifier: { type: String, required: true },
    ipAddress: { type: String, default: 'unknown' },
    userAgent: { type: String, default: 'unknown' },
    status: { type: String, enum: ['success', 'failed', 'locked'], required: true, index: true },
    failureReason: { type: String, default: null },
    timestamp: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

const AuditLogSchema = new Schema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, default: null, index: true },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: 'unknown' },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
    timestamp: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

const PasswordResetTokenSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: String, required: true },
    usedAt: { type: String, default: null },
    requestedByAdminId: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

const GuardianSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    occupation: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const EmergencyContactSchema = new Schema(
  {
    fullName: { type: String, default: '', trim: true },
    relationship: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const StudentHistorySchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['admission', 'promotion', 'transfer', 'graduation', 'archive', 'update'],
      required: true,
    },
    note: { type: String, default: '' },
    gradeLevel: { type: String, required: true },
    section: { type: String, default: '' },
    academicYear: { type: String, required: true },
    recordedBy: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false }
);

const StudentSchema = new Schema(
  {
    _id: { type: String, required: true },
    studentId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    admissionNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    fullName: { type: String, required: true, trim: true, index: true },
    gender: { type: String, enum: ['male', 'female'], required: true, index: true },
    dateOfBirth: { type: String, required: true },
    nationality: { type: String, default: 'Somali', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    photoUrl: { type: String, default: '' },
    division: { type: String, enum: ['Primary', 'Secondary'], required: true, index: true },
    gradeLevel: { type: String, required: true, trim: true, index: true },
    section: { type: String, default: 'A', trim: true, uppercase: true, index: true },
    className: { type: String, required: true, trim: true, index: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    admissionDate: { type: String, required: true },
    previousSchool: { type: String, default: '', trim: true },
    medicalNotes: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['active', 'applicant', 'transferred', 'graduated', 'archived'],
      default: 'active',
      index: true,
    },
    guardian: { type: GuardianSchema, required: true },
    emergencyContact: { type: EmergencyContactSchema, default: () => ({}) },
    linkedUserId: { type: String, default: null, index: true },
    linkedParentUserId: { type: String, default: null, index: true },
    history: { type: [StudentHistorySchema], default: [] },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

const AcademicResultSchema = new Schema(
  {
    _id: { type: String, required: true },
    studentId: { type: String, required: true, index: true },
    studentCode: { type: String, required: true, uppercase: true, trim: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    gradeLevel: { type: String, required: true, trim: true, index: true },
    section: { type: String, default: 'A', trim: true, uppercase: true },
    term: { type: String, enum: ['Final', 'Annual'], default: 'Final' },
    averageScore: { type: Number, required: true, min: 0, max: 100 },
    outcome: {
      type: String,
      enum: ['passed', 'promoted_with_support', 'retained'],
      default: 'passed',
    },
    status: {
      type: String,
      enum: ['draft', 'processed', 'published'],
      default: 'draft',
      index: true,
    },
    remarks: { type: String, default: '', trim: true },
    processedBy: { type: String, default: '' },
    processedAt: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

AcademicResultSchema.index({ studentId: 1, academicYear: 1, gradeLevel: 1, term: 1 }, { unique: true });

const AttendanceSchema = new Schema(
  {
    _id: { type: String, required: true },
    studentId: { type: String, required: true, index: true },
    studentCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    studentName: { type: String, required: true, trim: true },
    division: { type: String, enum: ['Primary', 'Secondary'], required: true },
    gradeLevel: { type: String, required: true, trim: true, index: true },
    section: { type: String, default: 'A', trim: true, uppercase: true },
    className: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    date: { type: String, required: true, index: true },
    session: { type: String, enum: ['Morning', 'Afternoon', 'Full Day'], default: 'Morning' },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'excused'],
      default: 'present',
      index: true,
    },
    method: {
      type: String,
      enum: ['teacher_rollcall', 'manual', 'qr_scan'],
      default: 'teacher_rollcall',
      index: true,
    },
    checkInTime: { type: String, required: true },
    qrTokenDigest: { type: String, default: '' },
    notes: { type: String, default: '', trim: true },
    recordedBy: { type: String, required: true },
    recordedById: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

AttendanceSchema.index({ studentId: 1, date: 1, session: 1 }, { unique: true });

const TeacherAttendanceSchema = new Schema(
  {
    _id: { type: String, required: true },
    teacherId: { type: String, required: true, index: true },
    teacherName: { type: String, required: true, trim: true },
    teacherEmail: { type: String, default: '', trim: true, lowercase: true },
    username: { type: String, default: '', trim: true },
    departmentName: { type: String, default: '', trim: true },
    date: { type: String, required: true, index: true },
    session: { type: String, enum: ['Morning', 'Afternoon', 'Full Day'], default: 'Morning' },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'excused'],
      default: 'present',
      index: true,
    },
    notes: { type: String, default: '', trim: true },
    recordedBy: { type: String, required: true },
    recordedById: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

TeacherAttendanceSchema.index({ teacherId: 1, date: 1, session: 1 }, { unique: true });

const AbsenceFollowUpSchema = new Schema(
  {
    id: { type: String, required: true },
    actionTaken: { type: String, required: true, trim: true },
    note: { type: String, default: '', trim: true },
    statusAfter: {
      type: String,
      enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'],
      required: true,
    },
    recordedBy: { type: String, required: true },
    recordedById: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false }
);

const AbsenceWarningSchema = new Schema(
  {
    _id: { type: String, required: true },
    subjectType: { type: String, enum: ['student', 'teacher'], required: true, index: true },
    subjectId: { type: String, required: true, index: true },
    subjectCode: { type: String, default: '', trim: true },
    subjectName: { type: String, required: true, trim: true },
    subjectDetail: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },
    consecutiveDays: { type: Number, required: true, min: 3 },
    absentDates: { type: [String], default: [] },
    streakKey: { type: String, required: true, unique: true, index: true },
    severity: { type: String, enum: ['warning', 'critical'], default: 'warning', index: true },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'],
      default: 'open',
      index: true,
    },
    message: { type: String, required: true },
    followUpNotes: { type: [AbsenceFollowUpSchema], default: [] },
    acknowledgedBy: { type: String, default: null },
    acknowledgedAt: { type: String, default: null },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: String, default: null },
    resolutionSummary: { type: String, default: '' },
    triggeredAt: { type: String, required: true },
    lastEvaluatedAt: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

export const MongooseModels = {
  User: mongoose.models.User || mongoose.model('User', UserSchema),
  Role: mongoose.models.Role || mongoose.model('Role', RoleSchema),
  Department: mongoose.models.Department || mongoose.model('Department', DepartmentSchema),
  DashboardConfiguration:
    mongoose.models.DashboardConfiguration ||
    mongoose.model('DashboardConfiguration', DashboardConfigurationSchema),
  SchoolSettings: mongoose.models.SchoolSettings || mongoose.model('SchoolSettings', SchoolSettingsSchema),
  LoginHistory: mongoose.models.LoginHistory || mongoose.model('LoginHistory', LoginHistorySchema),
  AuditLog: mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema),
  PasswordResetToken:
    mongoose.models.PasswordResetToken || mongoose.model('PasswordResetToken', PasswordResetTokenSchema),
  Student: mongoose.models.Student || mongoose.model('Student', StudentSchema),
  AcademicResult:
    mongoose.models.AcademicResult || mongoose.model('AcademicResult', AcademicResultSchema),
  Attendance: mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema),
  TeacherAttendance:
    mongoose.models.TeacherAttendance ||
    mongoose.model('TeacherAttendance', TeacherAttendanceSchema),
  AbsenceWarning:
    mongoose.models.AbsenceWarning || mongoose.model('AbsenceWarning', AbsenceWarningSchema),
  ExamSession: mongoose.models.ExamSession || mongoose.model('ExamSession', new Schema(
    {
      _id: { type: String, required: true },
      title: { type: String, required: true, trim: true },
      academicYear: { type: String, required: true, trim: true, index: true },
      term: { type: String, enum: ['Term 1', 'Term 2', 'Midterm', 'Final', 'Annual'], required: true },
      division: { type: String, enum: ['All', 'Primary', 'Secondary'], default: 'All' },
      startDate: { type: String, required: true },
      endDate: { type: String, required: true },
      status: { type: String, enum: ['scheduled', 'ongoing', 'completed', 'published'], default: 'scheduled', index: true },
      description: { type: String, default: '', trim: true },
      createdBy: { type: String, required: true },
      createdById: { type: String, required: true },
    },
    { timestamps: true, versionKey: false }
  )),
  ExamSchedule: mongoose.models.ExamSchedule || mongoose.model('ExamSchedule', new Schema(
    {
      _id: { type: String, required: true },
      examSessionId: { type: String, default: null, index: true },
      examTitle: { type: String, required: true, trim: true },
      academicYear: { type: String, required: true, trim: true, index: true },
      term: { type: String, enum: ['Term 1', 'Term 2', 'Midterm', 'Final', 'Annual'], required: true },
      division: { type: String, enum: ['Primary', 'Secondary'], required: true, index: true },
      gradeLevel: { type: String, required: true, trim: true, index: true },
      section: { type: String, default: 'All', trim: true },
      subjectName: { type: String, required: true, trim: true },
      subjectCode: { type: String, default: '', trim: true, uppercase: true },
      examDate: { type: String, required: true, index: true },
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
      room: { type: String, default: '', trim: true },
      invigilatorId: { type: String, default: null },
      invigilatorName: { type: String, default: '', trim: true },
      maxMarks: { type: Number, default: 100, min: 1, max: 1000 },
      passMarks: { type: Number, default: 50, min: 0, max: 1000 },
      status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled', index: true },
      notes: { type: String, default: '', trim: true },
      createdBy: { type: String, required: true },
      createdById: { type: String, required: true },
    },
    { timestamps: true, versionKey: false }
  )),
  ExamMark: mongoose.models.ExamMark || mongoose.model('ExamMark', new Schema(
    {
      _id: { type: String, required: true },
      examScheduleId: { type: String, required: true, index: true },
      examSessionId: { type: String, default: null, index: true },
      examTitle: { type: String, required: true, trim: true },
      academicYear: { type: String, required: true, trim: true, index: true },
      term: { type: String, enum: ['Term 1', 'Term 2', 'Midterm', 'Final', 'Annual'], required: true },
      division: { type: String, enum: ['Primary', 'Secondary'], required: true },
      gradeLevel: { type: String, required: true, trim: true, index: true },
      section: { type: String, default: 'A', trim: true, uppercase: true },
      subjectName: { type: String, required: true, trim: true },
      studentId: { type: String, required: true, index: true },
      studentCode: { type: String, required: true, uppercase: true, trim: true },
      studentName: { type: String, required: true, trim: true },
      score: { type: Number, required: true, min: 0 },
      maxMarks: { type: Number, required: true, min: 1 },
      passMarks: { type: Number, required: true, min: 0 },
      percentage: { type: Number, required: true, min: 0, max: 100 },
      gradeLetter: { type: String, required: true },
      passed: { type: Boolean, required: true },
      attendanceStatus: { type: String, enum: ['sat', 'absent', 'excused'], default: 'sat' },
      status: { type: String, enum: ['draft', 'submitted', 'approved', 'published'], default: 'draft', index: true },
      remarks: { type: String, default: '', trim: true },
      enteredBy: { type: String, required: true },
      enteredById: { type: String, required: true },
      approvedBy: { type: String, default: null },
      approvedAt: { type: String, default: null },
    },
    { timestamps: true, versionKey: false }
  ).index({ examScheduleId: 1, studentId: 1 }, { unique: true })),
};

