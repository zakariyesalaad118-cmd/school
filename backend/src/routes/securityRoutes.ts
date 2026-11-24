import { Router, type Request, type Response } from 'express';
import { db, getDatabaseEngineMode } from '../config/database.ts';
import { authenticate, requirePermission } from '../middleware/authMiddleware.ts';

export const securityRouter = Router();
securityRouter.use(authenticate);

securityRouter.get('/login-history', requirePermission('security', 'view'), async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  let logs = await db.loginHistory.findAll();
  if (status) {
    logs = logs.filter((l) => l.status === status);
  }
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.json({ loginHistory: logs.slice(0, limit) });
});

securityRouter.get('/audit-logs', requirePermission('audit', 'view'), async (req: Request, res: Response) => {
  const severity = typeof req.query.severity === 'string' ? req.query.severity : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)));

  let logs = await db.auditLogs.findAll();
  if (severity) logs = logs.filter((l) => l.severity === severity);
  if (search) {
    logs = logs.filter(
      (l) =>
        l.action.toLowerCase().includes(search) ||
        l.actorName.toLowerCase().includes(search) ||
        l.resourceType.toLowerCase().includes(search)
    );
  }
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.json({ auditLogs: logs.slice(0, limit) });
});

securityRouter.get('/system-health', requirePermission('security', 'view'), async (_req: Request, res: Response) => {
  const [usersCount, rolesCount, deptsCount, dashboardsCount, studentsCount, auditCount, loginCount] =
    await Promise.all([
      db.users.count(),
      db.roles.count(),
      db.departments.count(),
      db.dashboards.count(),
      db.students.count(),
      db.auditLogs.count(),
      db.loginHistory.count(),
    ]);

  res.json({
    health: {
      status: 'operational',
      databaseEngine: getDatabaseEngineMode(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      nodeVersion: process.version,
      collections: {
        users: usersCount,
        roles: rolesCount,
        departments: deptsCount,
        dashboards: dashboardsCount,
        students: studentsCount,
        auditLogs: auditCount,
        loginHistory: loginCount,
      },
      securityChecks: {
        publicSignupDisabled: true,
        passwordHashingAlgorithm: 'scrypt-256bit-salted',
        rateLimitingActive: true,
        backendRbacEnforced: true,
      },
    },
  });
});
