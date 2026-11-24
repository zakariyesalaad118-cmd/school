import crypto from 'node:crypto';
import type { Request } from 'express';
import { db } from '../config/database.ts';
import type { IAuditLog, ILoginHistory } from '../types/models.ts';
import { getClientIp } from '../utils/security.ts';

export async function recordAuditLog(params: {
  req?: Request;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'critical';
}): Promise<IAuditLog> {
  const entry: IAuditLog = {
    id: crypto.randomUUID(),
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId || null,
    details: params.details || {},
    ipAddress: params.req ? getClientIp(params.req) : 'system',
    severity: params.severity || 'info',
    timestamp: new Date().toISOString(),
  };
  return db.auditLogs.create(entry);
}

export async function recordLoginAttempt(params: {
  req: Request;
  userId: string | null;
  identifier: string;
  status: 'success' | 'failed' | 'locked';
  failureReason?: string | null;
}): Promise<ILoginHistory> {
  const entry: ILoginHistory = {
    id: crypto.randomUUID(),
    userId: params.userId,
    identifier: params.identifier,
    ipAddress: getClientIp(params.req),
    userAgent: String(params.req.headers['user-agent'] || 'unknown').slice(0, 240),
    status: params.status,
    failureReason: params.failureReason || null,
    timestamp: new Date().toISOString(),
  };
  return db.loginHistory.create(entry);
}
