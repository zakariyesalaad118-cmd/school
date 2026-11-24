import crypto from 'node:crypto';
import { db } from '../config/database.ts';
import { env } from '../config/env.ts';
import type {
  DashboardWidgetConfig,
  IDashboardConfiguration,
  IDepartment,
  IRole,
  ISchoolSettings,
  IUser,
  SystemModule,
} from '../types/models.ts';
import { SYSTEM_MODULES } from '../types/models.ts';
import { hashPassword } from '../utils/security.ts';
import { recordAuditLog } from './auditService.ts';

const DEFAULT_DEPARTMENTS: Array<{ id: string; name: string; code: string; description: string }> = [
  {
    id: 'dept_exec',
    name: 'Executive Administration',
    code: 'EXEC',
    description: 'School governance, leadership, and institutional strategy.',
  },
  {
    id: 'dept_acad',
    name: 'Academic Affairs',
    code: 'ACAD',
    description: 'Primary & secondary curriculum, instruction, and examinations.',
  },
  {
    id: 'dept_fin',
    name: 'Finance & Accounting',
    code: 'FIN',
    description: 'Tuition collection, payroll, budgeting, and financial compliance.',
  },
  {
    id: 'dept_reg',
    name: 'Admissions & Registrar',
    code: 'REG',
    description: 'Student admissions, enrollment records, transfers, and certification.',
  },
  {
    id: 'dept_hr',
    name: 'Human Resources',
    code: 'HR',
    description: 'Staff recruitment, contracts, attendance, and leave management.',
  },
  {
    id: 'dept_lib',
    name: 'Library & Learning Resources',
    code: 'LIB',
    description: 'Textbooks, digital archives, and lending operations.',
  },
  {
    id: 'dept_trn',
    name: 'Transport & Logistics',
    code: 'TRN',
    description: 'School buses, routes, drivers, and campus logistics.',
  },
];

const DEFAULT_ROLES: Array<{
  id: string;
  name: string;
  slug: string;
  description: string;
  departmentId: string;
  permissions: string[];
  modules: SystemModule[];
  isSystemRole: boolean;
  isSuperAdminRole: boolean;
  dashboardId: string;
}> = [
  {
    id: 'role_super_admin',
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Unrestricted system governance, role engine, branding, security, and school operations.',
    departmentId: 'dept_exec',
    permissions: ['*:*'],
    modules: [...SYSTEM_MODULES],
    isSystemRole: true,
    isSuperAdminRole: true,
    dashboardId: 'dash_super_admin',
  },
  {
    id: 'role_school_admin',
    name: 'School Admin',
    slug: 'school-admin',
    description: 'School-wide administration for users, departments, academics, and reports.',
    departmentId: 'dept_exec',
    permissions: [
      'overview:view',
      'users:view',
      'users:create',
      'users:edit',
      'departments:view',
      'departments:edit',
      'branding:view',
      'students:manage',
      'teachers:manage',
      'academics:manage',
      'attendance:view',
      'exams:manage',
      'finance:view',
      'reports:view',
      'reports:export',
    ],
    modules: ['overview', 'users', 'departments', 'students', 'teachers', 'academics', 'attendance', 'exams', 'finance', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_school_admin',
  },
  {
    id: 'role_principal',
    name: 'Principal',
    slug: 'principal',
    description: 'Academic leadership, teacher performance, and examination oversight.',
    departmentId: 'dept_exec',
    permissions: [
      'overview:view',
      'departments:view',
      'students:view',
      'teachers:view',
      'academics:manage',
      'attendance:view',
      'exams:approve',
      'exams:view',
      'reports:view',
      'reports:export',
    ],
    modules: ['overview', 'departments', 'students', 'teachers', 'academics', 'attendance', 'exams', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_principal',
  },
  {
    id: 'role_vice_principal',
    name: 'Vice Principal',
    slug: 'vice-principal',
    description: 'Daily campus operations, class supervision, and attendance monitoring.',
    departmentId: 'dept_acad',
    permissions: ['overview:view', 'students:view', 'teachers:view', 'academics:view', 'attendance:manage', 'reports:view'],
    modules: ['overview', 'students', 'teachers', 'academics', 'attendance', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_vice_principal',
  },
  {
    id: 'role_accountant',
    name: 'Accountant',
    slug: 'accountant',
    description: 'Fee collection, payments, receipts, expenses, and financial reporting.',
    departmentId: 'dept_fin',
    permissions: ['overview:view', 'finance:manage', 'reports:view', 'reports:export', 'reports:print'],
    modules: ['overview', 'finance', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_accountant',
  },
  {
    id: 'role_registrar',
    name: 'Registrar',
    slug: 'registrar',
    description: 'Student admissions, profiles, class assignments, and official records.',
    departmentId: 'dept_reg',
    permissions: ['overview:view', 'students:manage', 'academics:view', 'reports:view', 'reports:print'],
    modules: ['overview', 'students', 'academics', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_registrar',
  },
  {
    id: 'role_teacher',
    name: 'Teacher',
    slug: 'teacher',
    description: 'Assigned classes, attendance recording, grading, and lesson plans.',
    departmentId: 'dept_acad',
    permissions: [
      'overview:view',
      'students:view',
      'academics:view',
      'attendance:view',
      'attendance:create',
      'attendance:edit',
      'exams:view',
      'exams:create',
      'exams:edit',
    ],
    modules: ['overview', 'students', 'academics', 'attendance', 'exams'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_teacher',
  },
  {
    id: 'role_student',
    name: 'Student',
    slug: 'student',
    description: 'Personal academic schedule, attendance, results, homework, and fee summary.',
    departmentId: 'dept_acad',
    permissions: ['overview:view', 'academics:view', 'attendance:view', 'exams:view'],
    modules: ['overview', 'academics', 'attendance', 'exams'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_student',
  },
  {
    id: 'role_parent',
    name: 'Parent',
    slug: 'parent',
    description: 'Linked children progress, attendance, exam results, and fee statements.',
    departmentId: 'dept_reg',
    permissions: ['overview:view', 'attendance:view', 'exams:view', 'finance:view'],
    modules: ['overview', 'attendance', 'exams', 'finance'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_parent',
  },
  {
    id: 'role_hr_manager',
    name: 'HR Manager',
    slug: 'hr-manager',
    description: 'Employee records, contracts, staff attendance, and leave management.',
    departmentId: 'dept_hr',
    permissions: ['overview:view', 'users:view', 'hr:manage', 'teachers:view', 'reports:view'],
    modules: ['overview', 'users', 'hr', 'teachers', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_hr_manager',
  },
  {
    id: 'role_librarian',
    name: 'Librarian',
    slug: 'librarian',
    description: 'Library inventory, book lending, returns, and overdue monitoring.',
    departmentId: 'dept_lib',
    permissions: ['overview:view', 'library:manage', 'reports:view'],
    modules: ['overview', 'library', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_librarian',
  },
  {
    id: 'role_transport_manager',
    name: 'Transport Manager',
    slug: 'transport-manager',
    description: 'School buses, driver rosters, routes, and student transport schedules.',
    departmentId: 'dept_trn',
    permissions: ['overview:view', 'transport:manage', 'reports:view'],
    modules: ['overview', 'transport', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_transport_manager',
  },
  {
    id: 'role_attendance_officer',
    name: 'Attendance Officer',
    slug: 'attendance-officer',
    description: 'Daily student & teacher attendance monitoring, 3-day absence alerts, and guardian/staff follow-up.',
    departmentId: 'dept_acad',
    permissions: [
      'overview:view',
      'students:view',
      'teachers:view',
      'attendance:manage',
      'reports:view',
      'reports:export',
    ],
    modules: ['overview', 'students', 'teachers', 'attendance', 'reports'],
    isSystemRole: true,
    isSuperAdminRole: false,
    dashboardId: 'dash_attendance_officer',
  },
];

function buildWidgetsForRole(roleId: string): DashboardWidgetConfig[] {
  if (roleId === 'role_super_admin') {
    return [
      { id: 'w1', type: 'kpi_users_summary', titleKey: 'widgets.kpiUsersSummary', enabled: true, order: 1, span: 1 },
      { id: 'w2', type: 'kpi_roles_departments', titleKey: 'widgets.kpiRolesDepartments', enabled: true, order: 2, span: 1 },
      { id: 'w3', type: 'kpi_exams_summary', titleKey: 'widgets.kpiExamsSummary', enabled: true, order: 3, span: 1 },
      { id: 'w4', type: 'chart_exam_performance', titleKey: 'widgets.chartExamPerformance', enabled: true, order: 4, span: 2 },
      { id: 'w5', type: 'panel_exam_schedule', titleKey: 'widgets.panelExamSchedule', enabled: true, order: 5, span: 1 },
      { id: 'w6', type: 'chart_user_distribution', titleKey: 'widgets.chartUserDistribution', enabled: true, order: 6, span: 2 },
      { id: 'w7', type: 'kpi_security_posture', titleKey: 'widgets.kpiSecurityPosture', enabled: true, order: 7, span: 1 },
      { id: 'w8', type: 'table_recent_exam_results', titleKey: 'widgets.tableRecentExamResults', enabled: true, order: 8, span: 2 },
      { id: 'w9', type: 'panel_school_identity', titleKey: 'widgets.panelSchoolIdentity', enabled: true, order: 9, span: 1 },
      { id: 'w10', type: 'chart_auth_activity', titleKey: 'widgets.chartAuthActivity', enabled: true, order: 10, span: 2 },
      { id: 'w11', type: 'panel_system_health', titleKey: 'widgets.panelSystemHealth', enabled: true, order: 11, span: 1 },
      { id: 'w12', type: 'table_recent_audit', titleKey: 'widgets.tableRecentAudit', enabled: true, order: 12, span: 2 },
      { id: 'w13', type: 'panel_quick_actions', titleKey: 'widgets.panelQuickActions', enabled: true, order: 13, span: 1 },
    ];
  }
  if (roleId === 'role_school_admin' || roleId === 'role_principal') {
    return [
      { id: 'w1', type: 'kpi_users_summary', titleKey: 'widgets.kpiUsersSummary', enabled: true, order: 1, span: 1 },
      { id: 'w2', type: 'kpi_roles_departments', titleKey: 'widgets.kpiRolesDepartments', enabled: true, order: 2, span: 1 },
      { id: 'w3', type: 'kpi_exams_summary', titleKey: 'widgets.kpiExamsSummary', enabled: true, order: 3, span: 1 },
      { id: 'w4', type: 'chart_exam_performance', titleKey: 'widgets.chartExamPerformance', enabled: true, order: 4, span: 2 },
      { id: 'w5', type: 'panel_exam_schedule', titleKey: 'widgets.panelExamSchedule', enabled: true, order: 5, span: 1 },
      { id: 'w6', type: 'table_recent_exam_results', titleKey: 'widgets.tableRecentExamResults', enabled: true, order: 6, span: 2 },
      { id: 'w7', type: 'panel_school_identity', titleKey: 'widgets.panelSchoolIdentity', enabled: true, order: 7, span: 1 },
      { id: 'w8', type: 'chart_department_capacity', titleKey: 'widgets.chartDepartmentCapacity', enabled: true, order: 8, span: 2 },
      { id: 'w9', type: 'panel_quick_actions', titleKey: 'widgets.panelQuickActions', enabled: true, order: 9, span: 1 },
      { id: 'w10', type: 'panel_module_directory', titleKey: 'widgets.panelModuleDirectory', enabled: true, order: 10, span: 3 },
    ];
  }
  if (roleId === 'role_teacher' || roleId === 'role_student' || roleId === 'role_parent') {
    return [
      { id: 'w1', type: 'kpi_exams_summary', titleKey: 'widgets.kpiExamsSummary', enabled: true, order: 1, span: 1 },
      { id: 'w2', type: 'panel_exam_schedule', titleKey: 'widgets.panelExamSchedule', enabled: true, order: 2, span: 1 },
      { id: 'w3', type: 'panel_school_identity', titleKey: 'widgets.panelSchoolIdentity', enabled: true, order: 3, span: 1 },
      { id: 'w4', type: 'chart_exam_performance', titleKey: 'widgets.chartExamPerformance', enabled: true, order: 4, span: 2 },
      { id: 'w5', type: 'panel_quick_actions', titleKey: 'widgets.panelQuickActions', enabled: true, order: 5, span: 1 },
      { id: 'w6', type: 'table_recent_exam_results', titleKey: 'widgets.tableRecentExamResults', enabled: true, order: 6, span: 2 },
      { id: 'w7', type: 'panel_module_directory', titleKey: 'widgets.panelModuleDirectory', enabled: true, order: 7, span: 1 },
    ];
  }
  return [
    { id: 'w1', type: 'panel_school_identity', titleKey: 'widgets.panelSchoolIdentity', enabled: true, order: 1, span: 1 },
    { id: 'w2', type: 'panel_module_directory', titleKey: 'widgets.panelModuleDirectory', enabled: true, order: 2, span: 2 },
    { id: 'w3', type: 'panel_quick_actions', titleKey: 'widgets.panelQuickActions', enabled: true, order: 3, span: 1 },
  ];
}

export async function ensureSystemSeeded(): Promise<void> {
  const now = new Date().toISOString();

  // 1. School settings
  const existingSettings = await db.schoolSettings.findById('school_primary');
  if (!existingSettings) {
    const settings: ISchoolSettings = {
      id: 'school_primary',
      osName: 'NEXUS SCHOOL OS',
      schoolName: 'SOMALI PRIMERY AND SECONDARY SCHOOL',
      slogan: 'One School. One Intelligence. One Connected Future.',
      address: 'KM4 Boulevard, Hodan District, Mogadishu',
      phone: '+252 61 500 0000',
      email: 'info@somalischool.edu.so',
      website: 'https://somalischool.edu.so',
      logoUrl: '/src/assets/images/school_crest_emblem_1795505841452.jpg',
      primaryColor: '#0F4C81',
      secondaryColor: '#1E3A5F',
      accentColor: '#059669',
      defaultLanguage: 'en',
      defaultTheme: 'light',
      loginHeadline: 'SOMALI PRIMERY AND SECONDARY SCHOOL',
      loginSubheadline: 'One School. One Intelligence. One Connected Future.',
      setupCompleted: false,
      updatedAt: now,
    };
    await db.schoolSettings.create(settings);
  }

  // 2. Departments
  for (const dept of DEFAULT_DEPARTMENTS) {
    const existing = await db.departments.findById(dept.id);
    if (!existing) {
      await db.departments.create({
        ...dept,
        managerId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // 3. Roles & Dashboards
  const examWidgetRoleIds = new Set([
    'role_super_admin',
    'role_school_admin',
    'role_principal',
    'role_teacher',
    'role_student',
    'role_parent',
  ]);

  for (const roleDef of DEFAULT_ROLES) {
    const existingRole = await db.roles.findById(roleDef.id);
    if (!existingRole) {
      await db.roles.create({
        ...roleDef,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    } else if (roleDef.id === 'role_teacher' || roleDef.id === 'role_school_admin') {
      const perms = new Set(existingRole.permissions || []);
      const mods = new Set(existingRole.modules || []);
      let changed = false;
      if (roleDef.id === 'role_teacher' && !perms.has('exams:view')) {
        perms.add('exams:view');
        changed = true;
      }
      if (roleDef.id === 'role_school_admin' && !perms.has('exams:manage') && !perms.has('exams:view')) {
        perms.add('exams:manage');
        changed = true;
      }
      if (!mods.has('exams')) {
        mods.add('exams');
        changed = true;
      }
      if (changed) {
        await db.roles.updateById(existingRole.id, {
          permissions: Array.from(perms),
          modules: Array.from(mods),
          updatedAt: now,
        });
      }
    }
    const existingDash = await db.dashboards.findById(roleDef.dashboardId);
    if (!existingDash) {
      const dash: IDashboardConfiguration = {
        id: roleDef.dashboardId,
        name: `${roleDef.name} Workspace`,
        description: `Configured dashboard layout for ${roleDef.name}.`,
        roleId: roleDef.id,
        modules: roleDef.modules,
        widgets: buildWidgetsForRole(roleDef.id),
        assignedUserIds: [],
        isDefault: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      await db.dashboards.create(dash);
    } else if (examWidgetRoleIds.has(roleDef.id)) {
      const existingTypes = new Set(existingDash.widgets.map((w) => w.type));
      const desiredExamWidgets = buildWidgetsForRole(roleDef.id).filter((w) =>
        w.type === 'kpi_exams_summary' ||
        w.type === 'panel_exam_schedule' ||
        w.type === 'chart_exam_performance' ||
        w.type === 'table_recent_exam_results'
      );
      const missingWidgets = desiredExamWidgets.filter((w) => !existingTypes.has(w.type));
      const nextModules: SystemModule[] = existingDash.modules.includes('exams')
        ? existingDash.modules
        : [...existingDash.modules, 'exams' as SystemModule];

      if (missingWidgets.length > 0 || nextModules.length !== existingDash.modules.length) {
        const baseOrder = existingDash.widgets.reduce((max, w) => Math.max(max, w.order), 0);
        const appended = missingWidgets.map((w, idx) => ({
          ...w,
          id: `w_${w.type}_${roleDef.id}`,
          order: baseOrder + idx + 1,
        }));
        await db.dashboards.updateById(existingDash.id, {
          modules: nextModules,
          widgets: [...existingDash.widgets, ...appended],
          updatedAt: now,
        });
      }
    }
  }

  // 4. Optional environment-based initial Super Admin seed
  const superAdmins = await db.users.findAll({ isSuperAdmin: true });
  if (
    superAdmins.length === 0 &&
    env.initialSuperAdmin.email &&
    env.initialSuperAdmin.password &&
    env.initialSuperAdmin.password.length >= 10
  ) {
    await createInitialSuperAdmin({
      fullName: env.initialSuperAdmin.fullName,
      email: env.initialSuperAdmin.email,
      username: env.initialSuperAdmin.username,
      password: env.initialSuperAdmin.password,
      source: 'env-seed',
    });
  }
}

export async function isInitialSetupRequired(): Promise<boolean> {
  const users = await db.users.findAll({ isSuperAdmin: true, status: 'active' });
  return users.length === 0;
}

export async function createInitialSuperAdmin(params: {
  fullName: string;
  email: string;
  username: string;
  password: string;
  source: 'bootstrap-ui' | 'env-seed' | 'cli-seed';
}): Promise<IUser> {
  const existingSuperAdmins = await db.users.findAll({ isSuperAdmin: true });
  if (existingSuperAdmins.length > 0) {
    throw new Error('Initial Super Admin has already been configured.');
  }

  const now = new Date().toISOString();
  const user: IUser = {
    id: `usr_${crypto.randomUUID().slice(0, 12)}`,
    fullName: params.fullName.trim(),
    email: params.email.trim().toLowerCase(),
    username: params.username.trim().toLowerCase(),
    passwordHash: hashPassword(params.password),
    roleId: 'role_super_admin',
    departmentId: 'dept_exec',
    customPermissions: [],
    deniedPermissions: [],
    status: 'active',
    isSuperAdmin: true,
    mustChangePassword: false,
    themePreference: 'system',
    languagePreference: 'en',
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockUntil: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.users.create(user);
  await db.schoolSettings.updateById('school_primary', {
    setupCompleted: true,
    updatedAt: now,
  });

  await recordAuditLog({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: 'Super Admin',
    action: 'SYSTEM_BOOTSTRAP_SUPER_ADMIN',
    resourceType: 'user',
    resourceId: user.id,
    details: { source: params.source, email: user.email },
    severity: 'critical',
  });

  return user;
}
