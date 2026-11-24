import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.ts';
import {
  authenticate,
  requirePermission,
  verifyReauthPassword,
} from '../middleware/authMiddleware.ts';
import { recordAuditLog } from '../services/auditService.ts';
import type { IRole } from '../types/models.ts';
import { isValidPermissionString } from '../utils/permissions.ts';
import { roleSchema } from '../validators/schemas.ts';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const roleRouter = Router();
roleRouter.use(authenticate);

roleRouter.get('/', requirePermission('roles', 'view'), async (_req: Request, res: Response) => {
  const roles = await db.roles.findAll();
  const users = await db.users.findAll();
  const departments = await db.departments.findAll();
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const rolesWithMeta = roles.map((r) => ({
    ...r,
    departmentName: r.departmentId ? deptMap.get(r.departmentId) || null : null,
    userCount: users.filter((u) => u.roleId === r.id).length,
  }));

  res.json({ roles: rolesWithMeta });
});

roleRouter.post('/', requirePermission('roles', 'create'), async (req: Request, res: Response) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid role payload' });
    return;
  }

  const data = parsed.data;
  const slug = slugify(data.name);
  const existing = await db.roles.findAll();
  if (existing.some((r) => r.slug === slug || r.name.toLowerCase() === data.name.toLowerCase())) {
    res.status(409).json({ error: 'A role with this name already exists' });
    return;
  }

  const validPermissions = data.permissions.filter(isValidPermissionString);
  if (!req.auth!.user.isSuperAdmin && validPermissions.includes('*:*')) {
    res.status(403).json({ error: 'Only Super Admin can assign wildcard permissions' });
    return;
  }

  const now = new Date().toISOString();
  const role: IRole = {
    id: `role_${crypto.randomUUID().slice(0, 10)}`,
    name: data.name,
    slug,
    description: data.description,
    departmentId: data.departmentId,
    permissions: validPermissions,
    modules: data.modules,
    isSystemRole: false,
    isSuperAdminRole: false,
    isActive: data.isActive,
    dashboardId: data.dashboardId,
    createdAt: now,
    updatedAt: now,
  };

  await db.roles.create(role);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'ROLE_CREATED',
    resourceType: 'role',
    resourceId: role.id,
    details: { name: role.name, permissionsCount: role.permissions.length },
    severity: 'info',
  });

  res.status(201).json({ role });
});

roleRouter.patch('/:id', requirePermission('roles', 'edit'), async (req: Request, res: Response) => {
  const role = await db.roles.findById(req.params.id);
  if (!role) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }

  if (role.isSuperAdminRole) {
    res.status(403).json({ error: 'Super Admin system role permissions cannot be restricted' });
    return;
  }

  const parsed = roleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid role payload' });
    return;
  }

  const data = parsed.data;
  const updates: Partial<IRole> = { updatedAt: new Date().toISOString() };
  if (data.name !== undefined) {
    updates.name = data.name;
    if (!role.isSystemRole) updates.slug = slugify(data.name);
  }
  if (data.description !== undefined) updates.description = data.description;
  if (data.departmentId !== undefined) updates.departmentId = data.departmentId;
  if (data.modules !== undefined) updates.modules = data.modules;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (data.dashboardId !== undefined) updates.dashboardId = data.dashboardId;
  if (data.permissions !== undefined) {
    const clean = data.permissions.filter(isValidPermissionString);
    if (!req.auth!.user.isSuperAdmin && clean.includes('*:*')) {
      res.status(403).json({ error: 'Wildcard permissions restricted to Super Admin' });
      return;
    }
    updates.permissions = clean;
  }

  const updated = await db.roles.updateById(role.id, updates);

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'ROLE_UPDATED',
    resourceType: 'role',
    resourceId: role.id,
    details: { name: updated?.name, updatedFields: Object.keys(updates) },
    severity: 'warning',
  });

  res.json({ role: updated });
});

roleRouter.delete('/:id', requirePermission('roles', 'delete'), async (req: Request, res: Response) => {
  const role = await db.roles.findById(req.params.id);
  if (!role) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }
  if (role.isSystemRole || role.isSuperAdminRole) {
    res.status(403).json({ error: 'Core system roles cannot be deleted; deactivate instead if unused.' });
    return;
  }

  const assignedUsers = await db.users.findAll({ roleId: role.id });
  if (assignedUsers.length > 0) {
    res.status(409).json({
      error: `Cannot delete role while ${assignedUsers.length} user(s) are assigned to it. Reassign users or deactivate the role instead.`,
      code: 'ROLE_IN_USE',
      assignedCount: assignedUsers.length,
    });
    return;
  }

  const reauthOk = await verifyReauthPassword(req, req.body?.reauthPassword);
  if (!reauthOk) {
    res.status(403).json({
      error: 'Password verification required to delete a role',
      code: 'REAUTH_REQUIRED',
    });
    return;
  }

  await db.roles.deleteById(role.id);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'ROLE_DELETED',
    resourceType: 'role',
    resourceId: role.id,
    details: { name: role.name },
    severity: 'critical',
  });

  res.json({ success: true });
});
