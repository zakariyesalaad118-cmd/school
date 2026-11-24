import {
  PERMISSION_ACTIONS,
  SYSTEM_MODULES,
  type IRole,
  type IUser,
  type PermissionAction,
  type SystemModule,
  type WidgetType,
} from '../types/models.ts';

export interface WidgetCatalogEntry {
  type: WidgetType;
  titleKey: string;
  descriptionKey: string;
  requiredPermission: { module: SystemModule; action: PermissionAction };
  defaultSpan: 1 | 2 | 3;
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    type: 'kpi_users_summary',
    titleKey: 'widgets.kpiUsersSummary',
    descriptionKey: 'widgets.kpiUsersSummaryDesc',
    requiredPermission: { module: 'overview', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'kpi_roles_departments',
    titleKey: 'widgets.kpiRolesDepartments',
    descriptionKey: 'widgets.kpiRolesDepartmentsDesc',
    requiredPermission: { module: 'overview', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'kpi_security_posture',
    titleKey: 'widgets.kpiSecurityPosture',
    descriptionKey: 'widgets.kpiSecurityPostureDesc',
    requiredPermission: { module: 'security', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'chart_user_distribution',
    titleKey: 'widgets.chartUserDistribution',
    descriptionKey: 'widgets.chartUserDistributionDesc',
    requiredPermission: { module: 'overview', action: 'view' },
    defaultSpan: 2,
  },
  {
    type: 'chart_department_capacity',
    titleKey: 'widgets.chartDepartmentCapacity',
    descriptionKey: 'widgets.chartDepartmentCapacityDesc',
    requiredPermission: { module: 'departments', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'chart_auth_activity',
    titleKey: 'widgets.chartAuthActivity',
    descriptionKey: 'widgets.chartAuthActivityDesc',
    requiredPermission: { module: 'security', action: 'view' },
    defaultSpan: 2,
  },
  {
    type: 'panel_school_identity',
    titleKey: 'widgets.panelSchoolIdentity',
    descriptionKey: 'widgets.panelSchoolIdentityDesc',
    requiredPermission: { module: 'overview', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'panel_quick_actions',
    titleKey: 'widgets.panelQuickActions',
    descriptionKey: 'widgets.panelQuickActionsDesc',
    requiredPermission: { module: 'overview', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'panel_system_health',
    titleKey: 'widgets.panelSystemHealth',
    descriptionKey: 'widgets.panelSystemHealthDesc',
    requiredPermission: { module: 'security', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'panel_module_directory',
    titleKey: 'widgets.panelModuleDirectory',
    descriptionKey: 'widgets.panelModuleDirectoryDesc',
    requiredPermission: { module: 'overview', action: 'view' },
    defaultSpan: 2,
  },
  {
    type: 'table_recent_audit',
    titleKey: 'widgets.tableRecentAudit',
    descriptionKey: 'widgets.tableRecentAuditDesc',
    requiredPermission: { module: 'audit', action: 'view' },
    defaultSpan: 2,
  },
  {
    type: 'table_recent_logins',
    titleKey: 'widgets.tableRecentLogins',
    descriptionKey: 'widgets.tableRecentLoginsDesc',
    requiredPermission: { module: 'security', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'kpi_exams_summary',
    titleKey: 'widgets.kpiExamsSummary',
    descriptionKey: 'widgets.kpiExamsSummaryDesc',
    requiredPermission: { module: 'exams', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'panel_exam_schedule',
    titleKey: 'widgets.panelExamSchedule',
    descriptionKey: 'widgets.panelExamScheduleDesc',
    requiredPermission: { module: 'exams', action: 'view' },
    defaultSpan: 1,
  },
  {
    type: 'chart_exam_performance',
    titleKey: 'widgets.chartExamPerformance',
    descriptionKey: 'widgets.chartExamPerformanceDesc',
    requiredPermission: { module: 'exams', action: 'view' },
    defaultSpan: 2,
  },
  {
    type: 'table_recent_exam_results',
    titleKey: 'widgets.tableRecentExamResults',
    descriptionKey: 'widgets.tableRecentExamResultsDesc',
    requiredPermission: { module: 'exams', action: 'view' },
    defaultSpan: 2,
  },
];

export function resolveEffectivePermissions(user: IUser, role: IRole | null): string[] {
  if (user.isSuperAdmin || role?.isSuperAdminRole) {
    return ['*:*'];
  }
  const set = new Set<string>();
  if (role && role.isActive) {
    for (const perm of role.permissions) {
      set.add(perm);
    }
  }
  for (const perm of user.customPermissions || []) {
    set.add(perm);
  }
  for (const denied of user.deniedPermissions || []) {
    set.delete(denied);
  }
  return Array.from(set);
}

export function hasPermission(
  effectivePermissions: string[],
  module: SystemModule,
  action: PermissionAction
): boolean {
  if (effectivePermissions.includes('*:*')) {
    return true;
  }
  if (effectivePermissions.includes(`${module}:manage`)) {
    return true;
  }
  return effectivePermissions.includes(`${module}:${action}`);
}

export function isValidPermissionString(perm: string): boolean {
  if (perm === '*:*') return true;
  const parts = perm.split(':');
  if (parts.length !== 2) return false;
  const [mod, act] = parts;
  return (
    (SYSTEM_MODULES as readonly string[]).includes(mod) &&
    (PERMISSION_ACTIONS as readonly string[]).includes(act)
  );
}
