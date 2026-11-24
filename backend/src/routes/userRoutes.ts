import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.ts';
import {
  authenticate,
  requirePermission,
  verifyReauthPassword,
} from '../middleware/authMiddleware.ts';
import { recordAuditLog } from '../services/auditService.ts';
import type { IUser, PublicUser } from '../types/models.ts';
import { isValidPermissionString } from '../utils/permissions.ts';
import { hashPassword } from '../utils/security.ts';
import {
  adminResetUserPasswordSchema,
  createUserSchema,
  updateUserSchema,
} from '../validators/schemas.ts';

function toPublicUser(user: IUser): PublicUser {
  const { passwordHash: _removed, ...rest } = user;
  return rest;
}

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/', requirePermission('users', 'view'), async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const roleId = typeof req.query.roleId === 'string' ? req.query.roleId : '';
  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';

  let users = await db.users.findAll();
  const roles = await db.roles.findAll();
  const departments = await db.departments.findAll();
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  if (search) {
    users = users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.username.toLowerCase().includes(search)
    );
  }
  if (roleId) users = users.filter((u) => u.roleId === roleId);
  if (departmentId) users = users.filter((u) => u.departmentId === departmentId);
  if (status) users = users.filter((u) => u.status === status);

  users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    users: users.map((u) => ({
      ...toPublicUser(u),
      roleName: roleMap.get(u.roleId)?.name || 'Unassigned',
      departmentName: u.departmentId ? deptMap.get(u.departmentId)?.name || 'Unassigned' : 'None',
    })),
  });
});

userRouter.post('/', requirePermission('users', 'create'), async (req: Request, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user data' });
    return;
  }

  const data = parsed.data;
  const targetRole = await db.roles.findById(data.roleId);
  if (!targetRole) {
    res.status(400).json({ error: 'Selected role does not exist' });
    return;
  }

  const grantingSuperAdmin = Boolean(data.isSuperAdmin || targetRole.isSuperAdminRole);
  if (grantingSuperAdmin) {
    if (!req.auth!.user.isSuperAdmin) {
      res.status(403).json({
        error: 'Only an existing Super Admin can create a Super Admin account',
      });
      return;
    }
    const reauthOk = await verifyReauthPassword(req, data.reauthPassword);
    if (!reauthOk) {
      res.status(403).json({
        error: 'Password confirmation is required to grant Super Admin privileges',
        code: 'REAUTH_REQUIRED',
      });
      return;
    }
  }

  const emailLower = data.email.toLowerCase();
  const usernameLower = data.username.toLowerCase();
  const existingUsers = await db.users.findAll();
  if (existingUsers.some((u) => u.email.toLowerCase() === emailLower)) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }
  if (existingUsers.some((u) => u.username.toLowerCase() === usernameLower)) {
    res.status(409).json({ error: 'This username is already taken' });
    return;
  }

  const customPermissions = (data.customPermissions || []).filter(isValidPermissionString);
  const deniedPermissions = (data.deniedPermissions || []).filter(isValidPermissionString);

  // Prevent privilege escalation by non-super-admins
  if (!req.auth!.user.isSuperAdmin && customPermissions.includes('*:*')) {
    res.status(403).json({ error: 'Privilege escalation blocked' });
    return;
  }

  const now = new Date().toISOString();
  const newUser: IUser = {
    id: `usr_${crypto.randomUUID().slice(0, 12)}`,
    fullName: data.fullName,
    email: emailLower,
    username: usernameLower,
    passwordHash: hashPassword(data.temporaryPassword),
    roleId: targetRole.id,
    departmentId: data.departmentId ?? targetRole.departmentId ?? null,
    customPermissions,
    deniedPermissions,
    status: data.status || 'active',
    isSuperAdmin: grantingSuperAdmin,
    mustChangePassword: true,
    themePreference: 'system',
    languagePreference: 'en',
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockUntil: null,
    createdBy: req.auth!.user.id,
    updatedBy: req.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.users.create(newUser);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: grantingSuperAdmin ? 'SUPER_ADMIN_CREATED' : 'USER_CREATED',
    resourceType: 'user',
    resourceId: newUser.id,
    details: { email: newUser.email, roleId: newUser.roleId, isSuperAdmin: grantingSuperAdmin },
    severity: grantingSuperAdmin ? 'critical' : 'info',
  });

  res.status(201).json({ user: toPublicUser(newUser) });
});

userRouter.patch('/:id', requirePermission('users', 'edit'), async (req: Request, res: Response) => {
  const target = await db.users.findById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload' });
    return;
  }

  const data = parsed.data;
  const nextRole = data.roleId ? await db.roles.findById(data.roleId) : await db.roles.findById(target.roleId);
  if (!nextRole) {
    res.status(400).json({ error: 'Selected role does not exist' });
    return;
  }

  const nextIsSuperAdmin =
    data.isSuperAdmin !== undefined
      ? data.isSuperAdmin || nextRole.isSuperAdminRole
      : target.isSuperAdmin || nextRole.isSuperAdminRole;

  const isPrivilegeChange =
    target.isSuperAdmin !== nextIsSuperAdmin ||
    (target.isSuperAdmin && data.status && data.status !== 'active');

  if (isPrivilegeChange) {
    if (!req.auth!.user.isSuperAdmin) {
      res.status(403).json({ error: 'Only a Super Admin can modify Super Admin privileges' });
      return;
    }
    const reauthOk = await verifyReauthPassword(req, data.reauthPassword);
    if (!reauthOk) {
      res.status(403).json({
        error: 'Password verification required for Super Admin privilege or status change',
        code: 'REAUTH_REQUIRED',
      });
      return;
    }
  }

  // Protect final active Super Admin from accidental deactivation or demotion
  if (target.isSuperAdmin) {
    const activeSuperAdmins = await db.users.findAll({ isSuperAdmin: true, status: 'active' });
    const removingFinalSuperAdmin =
      activeSuperAdmins.length <= 1 &&
      activeSuperAdmins[0]?.id === target.id &&
      ((data.status && data.status !== 'active') || data.isSuperAdmin === false || (data.roleId && !nextRole.isSuperAdminRole));
    if (removingFinalSuperAdmin) {
      res.status(409).json({
        error: 'Cannot deactivate or demote the final active Super Admin account',
        code: 'FINAL_SUPER_ADMIN_PROTECTED',
      });
      return;
    }
  }

  if (data.email && data.email.toLowerCase() !== target.email.toLowerCase()) {
    const allUsers = await db.users.findAll();
    if (allUsers.some((u) => u.id !== target.id && u.email.toLowerCase() === data.email!.toLowerCase())) {
      res.status(409).json({ error: 'Email address is already in use' });
      return;
    }
  }

  const updates: Partial<IUser> = {
    updatedBy: req.auth!.user.id,
    updatedAt: new Date().toISOString(),
  };
  if (data.fullName !== undefined) updates.fullName = data.fullName;
  if (data.email !== undefined) updates.email = data.email.toLowerCase();
  if (data.roleId !== undefined) updates.roleId = data.roleId;
  if (data.departmentId !== undefined) updates.departmentId = data.departmentId;
  if (data.status !== undefined) updates.status = data.status;
  if (data.isSuperAdmin !== undefined || data.roleId !== undefined) {
    updates.isSuperAdmin = nextIsSuperAdmin;
  }
  if (data.customPermissions !== undefined) {
    updates.customPermissions = data.customPermissions.filter(isValidPermissionString);
  }
  if (data.deniedPermissions !== undefined) {
    updates.deniedPermissions = data.deniedPermissions.filter(isValidPermissionString);
  }

  const updated = await db.users.updateById(target.id, updates);

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'USER_UPDATED',
    resourceType: 'user',
    resourceId: target.id,
    details: { updatedFields: Object.keys(updates) },
    severity: isPrivilegeChange ? 'critical' : 'info',
  });

  res.json({ user: updated ? toPublicUser(updated) : null });
});

userRouter.post(
  '/:id/reset-password',
  requirePermission('users', 'edit'),
  async (req: Request, res: Response) => {
    const target = await db.users.findById(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const parsed = adminResetUserPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password' });
      return;
    }

    if (target.isSuperAdmin && !req.auth!.user.isSuperAdmin) {
      res.status(403).json({ error: 'Only a Super Admin can reset another Super Admin password' });
      return;
    }

    await db.users.updateById(target.id, {
      passwordHash: hashPassword(parsed.data.temporaryPassword),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      updatedBy: req.auth!.user.id,
      updatedAt: new Date().toISOString(),
    });

    await recordAuditLog({
      req,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.fullName,
      actorRole: req.auth!.role?.name || 'Admin',
      action: 'ADMIN_RESET_USER_PASSWORD',
      resourceType: 'user',
      resourceId: target.id,
      severity: 'warning',
    });

    res.json({ success: true });
  }
);

userRouter.delete('/:id', requirePermission('users', 'delete'), async (req: Request, res: Response) => {
  const target = await db.users.findById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === req.auth!.user.id) {
    res.status(400).json({ error: 'You cannot delete your own active account' });
    return;
  }
  if (target.isSuperAdmin) {
    if (!req.auth!.user.isSuperAdmin) {
      res.status(403).json({ error: 'Only a Super Admin can delete a Super Admin account' });
      return;
    }
    const activeSuperAdmins = await db.users.findAll({ isSuperAdmin: true, status: 'active' });
    if (activeSuperAdmins.length <= 1 && activeSuperAdmins[0]?.id === target.id) {
      res.status(409).json({
        error: 'Cannot delete the final active Super Admin account',
        code: 'FINAL_SUPER_ADMIN_PROTECTED',
      });
      return;
    }
    const reauthOk = await verifyReauthPassword(req, req.body?.reauthPassword);
    if (!reauthOk) {
      res.status(403).json({
        error: 'Password confirmation is required to delete a Super Admin account',
        code: 'REAUTH_REQUIRED',
      });
      return;
    }
  }

  await db.users.deleteById(target.id);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'USER_DELETED',
    resourceType: 'user',
    resourceId: target.id,
    details: { email: target.email },
    severity: 'critical',
  });

  res.json({ success: true });
});
