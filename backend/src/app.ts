import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env.ts';
import { apiRateLimiter } from './middleware/rateLimiter.ts';
import { attendanceRouter } from './routes/attendanceRoutes.ts';
import { authRouter } from './routes/authRoutes.ts';
import { brandingRouter } from './routes/brandingRoutes.ts';
import { dashboardRouter } from './routes/dashboardRoutes.ts';
import { departmentRouter } from './routes/departmentRoutes.ts';
import { examRouter } from './routes/examRoutes.ts';
import { roleRouter } from './routes/roleRoutes.ts';
import { securityRouter } from './routes/securityRoutes.ts';
import { studentRouter } from './routes/studentRoutes.ts';
import { userRouter } from './routes/userRoutes.ts';

export function createBackendApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers without frameguard/CSP blocking AI Studio preview iframe or Cloudflare-hosted assets
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        if (env.appUrl && origin === env.appUrl) {
          callback(null, true);
          return;
        }
        // Allow same-host localhost and AI Studio run.app preview origins
        try {
          const url = new URL(origin);
          if (
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname.endsWith('.run.app')
          ) {
            callback(null, true);
            return;
          }
        } catch {
          // invalid origin
        }
        callback(new Error('CORS origin not allowed'));
      },
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use('/api', apiRateLimiter);

  // Serve validated uploaded school logos safely
  const uploadsDir = path.resolve(process.cwd(), 'backend', 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'nexus-school-os', phase: 1 });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/roles', roleRouter);
  app.use('/api/departments', departmentRouter);
  app.use('/api/dashboards', dashboardRouter);
  app.use('/api/branding', brandingRouter);
  app.use('/api/security', securityRouter);
  app.use('/api/students', studentRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/exams', examRouter);

  // Explicit 404 for unknown API paths
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[NEXUS API ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
