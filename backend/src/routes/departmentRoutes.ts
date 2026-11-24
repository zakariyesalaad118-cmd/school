import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.ts';
import {
  authenticate,
  requirePermission,
  verifyReauthPassword,
} from '../middleware/authMiddleware.ts';
import { recordAuditLog } from '../services/auditService.ts';
import type { IDepartment } from '../types/models.ts';
import { departmentSchema } from '../validators/schemas.ts';

export const departmentRouter = Router();
departmentRouter.use(authenticate);

departmentRouter.get('/', requirePermission('departments', 'view'), async (_req: Request, res: Response) => {
  const departments = await db.departments.findAll();
  const users = await db.users.findAll();
  const roles = await db.roles.findAll();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const enriched = departments.map((d) => ({
    ...d,
    managerName: d.managerId ? userMap.get(d.managerId)?.fullName || null : null,
    staffCount: users.filter((u) => u.departmentId === d.id).length,
    roleCount: roles.filter((r) => r.departmentId === d.id).length,
  }));

  res.json({ departments: enriched });
});

departmentRouter.post('/', requirePermission('departments', 'create'), async (req: Request, res: Response) => {
  const parsed = departmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid department data' });
    return;
  }

  const data = parsed.data;
  const codeUpper = data.code.toUpperCase();
  const existing = await db.departments.findAll();
  if (existing.some((d) => d.code.toUpperCase() === codeUpper || d.name.toLowerCase() === data.name.toLowerCase())) {
    res.status(409).json({ error: 'Department name or code already exists' });
    return;
  }

  const now = new Date().toISOString();
  const dept: IDepartment = {
    id: `dept_${crypto.randomUUID().slice(0, 10)}`,
    name: data.name,
    code: codeUpper,
    description: data.description,
    managerId: data.managerId,
    isActive: data.isActive,
    createdAt: now,
    updatedAt: now,
  };

  await db.departments.create(dept);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'DEPARTMENT_CREATED',
    resourceType: 'department',
    resourceId: dept.id,
    details: { name: dept.name, code: dept.code },
    severity: 'info',
  });

  res.status(201).json({ department: dept });
});

departmentRouter.patch('/:id', requirePermission('departments', 'edit'), async (req: Request, res: Response) => {
  const dept = await db.departments.findById(req.params.id);
  if (!dept) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  const parsed = departmentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid department update' });
    return;
  }

  const data = parsed.data;
  const updates: Partial<IDepartment> = { updatedAt: new Date().toISOString() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.code !== undefined) updates.code = data.code.toUpperCase();
  if (data.description !== undefined) updates.description = data.description;
  if (data.managerId !== undefined) updates.managerId = data.managerId;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const updated = await db.departments.updateById(dept.id, updates);

  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'DEPARTMENT_UPDATED',
    resourceType: 'department',
    resourceId: dept.id,
    details: { updatedFields: Object.keys(updates) },
    severity: 'info',
  });

  res.json({ department: updated });
});

departmentRouter.delete('/:id', requirePermission('departments', 'delete'), async (req: Request, res: Response) => {
  const dept = await db.departments.findById(req.params.id);
  if (!dept) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  const usersInDept = await db.users.findAll({ departmentId: dept.id });
  const rolesInDept = await db.roles.findAll({ departmentId: dept.id });
  if (usersInDept.length > 0 || rolesInDept.length > 0) {
    res.status(409).json({
      error: `Cannot delete department while ${usersInDept.length} staff member(s) and ${rolesInDept.length} role(s) reference it. Deactivate the department or reassign dependencies first.`,
      code: 'DEPARTMENT_IN_USE',
    });
    return;
  }

  const reauthOk = await verifyReauthPassword(req, req.body?.reauthPassword);
  if (!reauthOk) {
    res.status(403).json({
      error: 'Password verification required to delete a department',
      code: 'REAUTH_REQUIRED',
    });
    return;
  }

  await db.departments.deleteById(dept.id);
  await recordAuditLog({
    req,
    actorId: req.auth!.user.id,
    actorName: req.auth!.user.fullName,
    actorRole: req.auth!.role?.name || 'Admin',
    action: 'DEPARTMENT_DELETED',
    resourceType: 'department',
    resourceId: dept.id,
    details: { name: dept.name },
    severity: 'critical',
  });

  res.json({ success: true });
});
