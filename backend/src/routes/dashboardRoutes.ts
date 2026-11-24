import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { db, getDatabaseEngineMode } from '../config/database.ts';
import { authenticate, requirePermission } from '../middleware/authMiddleware.ts';
import { recordAuditLog } from '../services/auditService.ts';
import { buildExamTelemetryForUser } from '../services/examTelemetryService.ts';
import type { IDashboardConfiguration } from '../types/models.ts';
import { WIDGET_CATALOG, hasPermission } from '../utils/permissions.ts';
import { dashboardConfigSchema } from '../validators/schemas.ts';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/catalog', async (_req: Request, res: Response) => {
  res.json({ widgets: WIDGET_CATALOG });
});

dashboardRouter.get('/my', async (req: Request, res: Response) => {
  const { user, role, effectivePermissions } = req.auth!;
  const allDashboards = await db.dashboards.findAll({ isActive: true });

  // Priority: 1. Explicitly assigned to user, 2. Role's linked dashboardId, 3. RoleId match, 4. Fallback default
  let matched =
    allDashboards.find((d) => d.assignedUserIds.includes(user.id)) ||
    (role?.dashboardId ? allDashboards.find((d) => d.id === role.dashboardId) : undefined) ||
    allDashboards.find((d) => d.roleId === user.roleId) ||
    allDashboards.find((d) => d.isDefault) ||
    allDashboards[0] ||
    null;

  if (matched) {
    const catalogMap = new Map(WIDGET_CATALOG.map((w) => [w.type, w]));
    const permittedWidgets = matched.widgets
      .filter((w) => {
        if (!w.enabled) return false;
        const meta = catalogMap.get(w.type);
        if (!meta) return false;
        return hasPermission(
          effectivePermissions,
          meta.requiredPermission.module,
          meta.requiredPermission.action
        );
      })
      .sort((a, b) => a.order - b.order);

    matched = { ...matched, widgets: permittedWidgets };
  }

  // Real authorized database metrics filtered strictly by user permissions
  const users = await db.users.findAll();
  const roles = await db.roles.findAll();
  const departments = await db.departments.findAll();
  const schoolSettings = await db.schoolSettings.findById('school_primary');

  const canViewSecurity = hasPermission(effectivePermissions, 'security', 'view');
  const canViewAudit = hasPermission(effectivePermissions, 'audit', 'view');
  const loginHistory = canViewSecurity ? await db.loginHistory.findAll() : [];
  const auditLogs = canViewAudit ? await db.auditLogs.findAll() : [];
  const examTelemetry = await buildExamTelemetryForUser({ user, role, effectivePermissions });

  const roleDistribution = roles.map((r) => ({
    name: r.name,
    count: users.filter((u) => u.roleId === r.id).length,
  }));

  const departmentCapacity = departments.map((d) => ({
    code: d.code,
    name: d.name,
    staffCount: users.filter((u) => u.departmentId === d.id).length,
    roleCount: roles.filter((r) => r.departmentId === d.id).length,
  }));

  const recentLogins = [...loginHistory]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  const recentAudit = [...auditLogs]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  // Build real 7-day authentication activity series from actual loginHistory records
  const dayBuckets = new Map<string, { day: string; success: number; failed: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    dayBuckets.set(key, { day: key.slice(5), success: 0, failed: 0 });
  }
  for (const entry of loginHistory) {
    const key = entry.timestamp.slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (bucket) {
      if (entry.status === 'success') bucket.success += 1;
      else bucket.failed += 1;
    }
  }

  res.json({
    dashboard: matched,
    telemetry: {
      counts: {
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.status === 'active').length,
        inactiveUsers: users.filter((u) => u.status !== 'active').length,
        superAdmins: users.filter((u) => u.isSuperAdmin && u.status === 'active').length,
        totalRoles: roles.length,
        activeRoles: roles.filter((r) => r.isActive).length,
        totalDepartments: departments.length,
        activeDepartments: departments.filter((d) => d.isActive).length,
        failedLogins24h: loginHistory.filter(
          (l) =>
            l.status !== 'success' &&
            Date.now() - new Date(l.timestamp).getTime() <= 24 * 60 * 60 * 1000
        ).length,
      },
      roleDistribution,
      departmentCapacity,
      authActivitySeries: Array.from(dayBuckets.values()),
      recentLogins,
      recentAudit,
      examTelemetry,
      schoolSettings,
      systemHealth: canViewSecurity
        ? {
            databaseEngine: getDatabaseEngineMode(),
            uptimeSeconds: Math.floor(process.uptime()),
            memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
            nodeVersion: process.version,
          }
        : null,
    },
  });
});

dashboardRouter.get('/', requirePermission('dashboards', 'view'), async (_req: Request, res: Response) => {
  const dashboards = await db.dashboards.findAll();
  const roles = await db.roles.findAll();
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  res.json({
    dashboards: dashboards.map((d) => ({
      ...d,
      roleName: d.roleId ? roleMap.get(d.roleId) || 'Unlinked' : 'All / Custom',
    })),
  });
});

dashboardRouter.post('/', requirePermission('dashboards', 'create'), async (req: Request, res: Response) => {
  const parsed = dashboardConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid dashboard config' });
    return;
  }

  const now = new Date().toISOString();
  const dash: IDashboardConfiguration = {
    id: `dash_${crypto.randomUUID().slice(0, 10)}`,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  };

  await db.dashboards.create(dash);
  if (dash.roleId) {
    await db.roles.updateById(dash.roleId, { dashboardId: dash.id, updatedAt: now });
  }

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'DASHBOARD_CREATED',
    resourceType: 'dashboard',
    resourceId: dash.id,
    details: { name: dash.name, roleId: dash.roleId },
    severity: 'info',
  });

  res.status(201).json({ dashboard: dash });
});

dashboardRouter.patch('/:id', requirePermission('dashboards', 'edit'), async (req: Request, res: Response) => {
  const existing = await db.dashboards.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Dashboard configuration not found' });
    return;
  }

  const parsed = dashboardConfigSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid dashboard update' });
    return;
  }

  const now = new Date().toISOString();
  const updated = await db.dashboards.updateById(existing.id, {
    ...parsed.data,
    updatedAt: now,
  });

  if (parsed.data.roleId) {
    await db.roles.updateById(parsed.data.roleId, { dashboardId: existing.id, updatedAt: now });
  }

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'DASHBOARD_UPDATED',
    resourceType: 'dashboard',
    resourceId: existing.id,
    details: { name: updated?.name },
    severity: 'info',
  });

  res.json({ dashboard: updated });
});

dashboardRouter.delete('/:id', requirePermission('dashboards', 'delete'), async (req: Request, res: Response) => {
  const existing = await db.dashboards.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Dashboard not found' });
    return;
  }
  if (existing.isDefault) {
    res.status(409).json({ error: 'Default system dashboards cannot be deleted; edit or disable instead.' });
    return;
  }
  await db.dashboards.deleteById(existing.id);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'DASHBOARD_DELETED',
    resourceType: 'dashboard',
    resourceId: existing.id,
    severity: 'warning',
  });
  res.json({ success: true });
});
