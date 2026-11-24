import type { NextFunction, Request, Response } from 'express';
import { db } from '../config/database.ts';
import { env } from '../config/env.ts';
import type { IRole, IUser, PermissionAction, SystemModule } from '../types/models.ts';
import { hasPermission, resolveEffectivePermissions } from '../utils/permissions.ts';
import { verifyAccessToken, verifyPassword } from '../utils/security.ts';

export interface AuthContext {
  user: IUser;
  role: IRole | null;
  effectivePermissions: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyAccessToken(token);

    const user = await db.users.findById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account is deactivated or suspended', code: 'ACCOUNT_INACTIVE' });
      return;
    }

    const role = user.roleId ? await db.roles.findById(user.roleId) : null;
    const effectivePermissions = resolveEffectivePermissions(user, role);

    req.auth = { user, role, effectivePermissions };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token', code: 'INVALID_TOKEN' });
  }
}

export function requirePasswordUpdated(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    return;
  }
  if (req.auth.user.mustChangePassword) {
    res.status(403).json({
      error: 'Temporary password must be changed before accessing this resource',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    return;
  }
  next();
}

export function requirePermission(module: SystemModule, action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
      return;
    }
    if (req.auth.user.mustChangePassword) {
      res.status(403).json({
        error: 'Temporary password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      return;
    }
    if (!hasPermission(req.auth.effectivePermissions, module, action)) {
      res.status(403).json({
        error: `Missing required permission: ${module}:${action}`,
        code: 'FORBIDDEN',
      });
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    return;
  }
  if (!req.auth.user.isSuperAdmin && !req.auth.role?.isSuperAdminRole) {
    res.status(403).json({ error: 'Super Admin privileges required', code: 'SUPER_ADMIN_REQUIRED' });
    return;
  }
  next();
}

export async function verifyReauthPassword(req: Request, currentPassword?: string): Promise<boolean> {
  if (!req.auth || !currentPassword) return false;
  return verifyPassword(currentPassword, req.auth.user.passwordHash);
}

export function verifyCookieOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const requestedWith = req.headers['x-requested-with'];

  if (requestedWith === 'NexusSchoolOS') {
    next();
    return;
  }
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (host && parsed.host === host) {
        next();
        return;
      }
      if (env.corsOrigins.includes(parsed.origin) || (env.appUrl && parsed.origin === env.appUrl)) {
        next();
        return;
      }
    } catch {
      // fall through to rejection
    }
  }
  // Allow same-origin requests where browser omits Origin on GET or local curl
  if (!origin && req.method === 'GET') {
    next();
    return;
  }
  res.status(403).json({ error: 'Cross-site request blocked', code: 'ORIGIN_MISMATCH' });
}
