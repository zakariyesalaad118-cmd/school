import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.ts';
import { authenticate, verifyCookieOrigin } from '../middleware/authMiddleware.ts';
import { loginRateLimiter } from '../middleware/rateLimiter.ts';
import { recordAuditLog, recordLoginAttempt } from '../services/auditService.ts';
import { createInitialSuperAdmin, isInitialSetupRequired } from '../services/bootstrapService.ts';
import type { PublicUser } from '../types/models.ts';
import { resolveEffectivePermissions } from '../utils/permissions.ts';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../utils/security.ts';
import {
  bootstrapSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordTokenSchema,
  updatePreferencesSchema,
} from '../validators/schemas.ts';

const REFRESH_COOKIE_NAME = 'nexus_refresh_token';

function toPublicUser(user: any): PublicUser {
  const { passwordHash: _removed, ...rest } = user;
  return rest as PublicUser;
}

function setRefreshCookie(req: Request, res: Response, token: string) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: Boolean(isHttps),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearRefreshCookie(req: Request, res: Response) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: Boolean(isHttps),
    path: '/',
  });
}

export const authRouter = Router();

authRouter.get('/setup-status', async (_req: Request, res: Response) => {
  const setupRequired = await isInitialSetupRequired();
  const schoolSettings = await db.schoolSettings.findById('school_primary');
  res.json({ setupRequired, schoolSettings });
});

authRouter.post('/bootstrap', async (req: Request, res: Response) => {
  const setupRequired = await isInitialSetupRequired();
  if (!setupRequired) {
    res.status(403).json({
      error: 'System initialization is locked. Super Admin already exists.',
      code: 'BOOTSTRAP_LOCKED',
    });
    return;
  }

  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    return;
  }

  try {
    const user = await createInitialSuperAdmin({
      ...parsed.data,
      source: 'bootstrap-ui',
    });
    const role = await db.roles.findById(user.roleId);
    const effectivePermissions = resolveEffectivePermissions(user, role);
    const accessToken = signAccessToken({
      sub: user.id,
      roleId: user.roleId,
      isSuperAdmin: user.isSuperAdmin,
    });
    const refreshToken = signRefreshToken(user.id);
    setRefreshCookie(req, res, refreshToken);

    res.status(201).json({
      accessToken,
      user: toPublicUser(user),
      role,
      effectivePermissions,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Initialization failed' });
  }
});

authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid login fields' });
    return;
  }

  const identifier = parsed.data.identifier.toLowerCase();
  const allUsers = await db.users.findAll();
  const user = allUsers.find(
    (u) => u.email.toLowerCase() === identifier || u.username.toLowerCase() === identifier
  );

  if (!user) {
    await recordLoginAttempt({
      req,
      userId: null,
      identifier,
      status: 'failed',
      failureReason: 'Unknown user',
    });
    res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    return;
  }

  if (user.lockUntil && new Date(user.lockUntil).getTime() > Date.now()) {
    await recordLoginAttempt({
      req,
      userId: user.id,
      identifier,
      status: 'locked',
      failureReason: 'Account temporarily locked due to failed attempts',
    });
    res.status(423).json({
      error: 'Account temporarily locked. Try again in a few minutes.',
      code: 'ACCOUNT_LOCKED',
    });
    return;
  }

  if (user.status !== 'active') {
    await recordLoginAttempt({
      req,
      userId: user.id,
      identifier,
      status: 'failed',
      failureReason: `Account status is ${user.status}`,
    });
    res.status(403).json({
      error: 'Account is inactive or suspended. Contact your administrator.',
      code: 'ACCOUNT_INACTIVE',
    });
    return;
  }

  const passwordValid = verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    const failedCount = (user.failedLoginAttempts || 0) + 1;
    const shouldLock = failedCount >= 5;
    await db.users.updateById(user.id, {
      failedLoginAttempts: failedCount,
      lockUntil: shouldLock ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null,
    });
    await recordLoginAttempt({
      req,
      userId: user.id,
      identifier,
      status: shouldLock ? 'locked' : 'failed',
      failureReason: 'Invalid password',
    });
    res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    return;
  }

  const now = new Date().toISOString();
  const updatedUser =
    (await db.users.updateById(user.id, {
      failedLoginAttempts: 0,
      lockUntil: null,
      lastLoginAt: now,
    })) || user;

  const role = await db.roles.findById(updatedUser.roleId);
  const department = updatedUser.departmentId
    ? await db.departments.findById(updatedUser.departmentId)
    : null;
  const effectivePermissions = resolveEffectivePermissions(updatedUser, role);

  await recordLoginAttempt({
    req,
    userId: updatedUser.id,
    identifier,
    status: 'success',
  });

  await recordAuditLog({
    req,
    actorId: updatedUser.id,
    actorName: updatedUser.fullName,
    actorRole: role?.name || 'User',
    action: 'USER_LOGIN',
    resourceType: 'session',
    resourceId: updatedUser.id,
    details: { method: 'password' },
    severity: 'info',
  });

  const accessToken = signAccessToken({
    sub: updatedUser.id,
    roleId: updatedUser.roleId,
    isSuperAdmin: updatedUser.isSuperAdmin,
  });
  const refreshToken = signRefreshToken(updatedUser.id);
  setRefreshCookie(req, res, refreshToken);

  res.json({
    accessToken,
    user: toPublicUser(updatedUser),
    role,
    department,
    effectivePermissions,
  });
});

authRouter.get('/session', async (req: Request, res: Response) => {
  try {
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const access = await import('../utils/security.ts').then((m) =>
          m.verifyAccessToken(authHeader.slice(7).trim())
        );
        userId = access.sub;
      } catch {
        userId = null;
      }
    }

    if (!userId) {
      const cookieHeader = req.headers.cookie || '';
      const cookies = Object.fromEntries(
        cookieHeader
          .split(';')
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            const idx = c.indexOf('=');
            return idx > -1 ? [c.slice(0, idx), decodeURIComponent(c.slice(idx + 1))] : [c, ''];
          })
      );
      const refreshCookie = cookies[REFRESH_COOKIE_NAME];
      if (refreshCookie) {
        const decoded = verifyRefreshToken(refreshCookie);
        userId = decoded.sub;
      }
    }

    if (!userId) {
      res.status(401).json({ authenticated: false });
      return;
    }

    const user = await db.users.findById(userId);
    if (!user || user.status !== 'active') {
      clearRefreshCookie(req, res);
      res.status(401).json({ authenticated: false });
      return;
    }

    const role = await db.roles.findById(user.roleId);
    const department = user.departmentId ? await db.departments.findById(user.departmentId) : null;
    const effectivePermissions = resolveEffectivePermissions(user, role);
    const accessToken = signAccessToken({
      sub: user.id,
      roleId: user.roleId,
      isSuperAdmin: user.isSuperAdmin,
    });

    res.json({
      authenticated: true,
      accessToken,
      user: toPublicUser(user),
      role,
      department,
      effectivePermissions,
    });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});

authRouter.post('/logout', verifyCookieOrigin, async (req: Request, res: Response) => {
  clearRefreshCookie(req, res);
  res.json({ success: true });
});

authRouter.post('/change-password', authenticate, async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password format' });
    return;
  }

  const user = req.auth!.user;
  const currentValid = verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!currentValid) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    res.status(400).json({ error: 'New password must be different from your current password' });
    return;
  }

  const updated = await db.users.updateById(user.id, {
    passwordHash: hashPassword(parsed.data.newPassword),
    mustChangePassword: false,
    updatedAt: new Date().toISOString(),
  });

  await recordAuditLog({
    req,
    actorId: user.id,
    actorName: user.fullName,
    actorRole: req.auth!.role?.name || 'User',
    action: 'USER_PASSWORD_CHANGED',
    resourceType: 'user',
    resourceId: user.id,
    severity: 'info',
  });

  res.json({ success: true, user: updated ? toPublicUser(updated) : null });
});

authRouter.post('/forgot-password', loginRateLimiter, async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email or username required' });
    return;
  }

  const identifier = parsed.data.identifier.toLowerCase();
  const users = await db.users.findAll();
  const user = users.find(
    (u) => u.email.toLowerCase() === identifier || u.username.toLowerCase() === identifier
  );

  if (user && user.status === 'active') {
    const rawToken = generateSecureToken(24);
    const now = new Date();
    await db.passwordResets.create({
      id: `rst_${generateSecureToken(8)}`,
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      usedAt: null,
      requestedByAdminId: null,
      createdAt: now.toISOString(),
    });
    await recordAuditLog({
      req,
      actorId: user.id,
      actorName: user.fullName,
      actorRole: 'Self-Service',
      action: 'PASSWORD_RESET_REQUESTED',
      resourceType: 'user',
      resourceId: user.id,
      details: { identifier },
      severity: 'warning',
    });
  }

  // Always return neutral confirmation so account existence is never leaked
  res.json({
    success: true,
    message:
      'If an active account matches that identifier, a secure password reset request has been logged for administrator approval or delivery.',
  });
});

authRouter.post('/reset-password', loginRateLimiter, async (req: Request, res: Response) => {
  const parsed = resetPasswordTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid reset request' });
    return;
  }

  const hashed = hashToken(parsed.data.token);
  const resetDoc = await db.passwordResets.findOne({ tokenHash: hashed });
  if (!resetDoc || resetDoc.usedAt || new Date(resetDoc.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: 'Reset token is invalid or expired' });
    return;
  }

  const now = new Date().toISOString();
  await db.users.updateById(resetDoc.userId, {
    passwordHash: hashPassword(parsed.data.newPassword),
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockUntil: null,
    updatedAt: now,
  });
  await db.passwordResets.updateById(resetDoc.id, { usedAt: now });

  await recordAuditLog({
    req,
    actorId: resetDoc.userId,
    actorName: resetDoc.userId,
    actorRole: 'Password Reset',
    action: 'PASSWORD_RESET_COMPLETED',
    resourceType: 'user',
    resourceId: resetDoc.userId,
    severity: 'warning',
  });

  res.json({ success: true });
});

authRouter.post('/reauthenticate', authenticate, async (req: Request, res: Response) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }
  const ok = verifyPassword(password, req.auth!.user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Password verification failed' });
    return;
  }
  res.json({ verified: true });
});

authRouter.patch('/preferences', authenticate, async (req: Request, res: Response) => {
  const parsed = updatePreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid preferences payload' });
    return;
  }
  const updated = await db.users.updateById(req.auth!.user.id, {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  });
  res.json({ user: updated ? toPublicUser(updated) : null });
});
