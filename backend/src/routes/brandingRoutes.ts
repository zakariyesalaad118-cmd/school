import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.ts';
import { authenticate, requirePermission } from '../middleware/authMiddleware.ts';
import { recordAuditLog } from '../services/auditService.ts';
import { validateRasterLogoDataUrl } from '../utils/security.ts';
import { brandingUpdateSchema } from '../validators/schemas.ts';

const LOGO_UPLOAD_DIR = path.resolve(process.cwd(), 'backend', 'uploads', 'logos');

export const brandingRouter = Router();

brandingRouter.get('/', async (_req: Request, res: Response) => {
  const settings = await db.schoolSettings.findById('school_primary');
  res.json({ settings });
});

brandingRouter.patch(
  '/',
  authenticate,
  requirePermission('branding', 'manage'),
  async (req: Request, res: Response) => {
    const parsed = brandingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid branding update' });
      return;
    }

    const updated = await db.schoolSettings.updateById('school_primary', {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    });

    await recordAuditLog({
      req,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.fullName,
      actorRole: req.auth!.role?.name || 'Admin',
      action: 'SCHOOL_BRANDING_UPDATED',
      resourceType: 'school_settings',
      resourceId: 'school_primary',
      details: { updatedFields: Object.keys(parsed.data) },
      severity: 'info',
    });

    res.json({ settings: updated });
  }
);

brandingRouter.post(
  '/logo',
  authenticate,
  requirePermission('branding', 'manage'),
  async (req: Request, res: Response) => {
    const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    const check = validateRasterLogoDataUrl(dataUrl);
    if (!check.valid || !check.buffer || !check.ext) {
      res.status(400).json({ error: check.error || 'Invalid image upload' });
      return;
    }

    await fs.mkdir(LOGO_UPLOAD_DIR, { recursive: true });
    const filename = `school_logo_${crypto.randomUUID()}.${check.ext}`;
    const resolvedTarget = path.resolve(LOGO_UPLOAD_DIR, filename);
    if (!resolvedTarget.startsWith(LOGO_UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload path' });
      return;
    }

    await fs.writeFile(resolvedTarget, check.buffer);
    const logoUrl = `/uploads/logos/${filename}`;

    const updated = await db.schoolSettings.updateById('school_primary', {
      logoUrl,
      updatedAt: new Date().toISOString(),
    });

    await recordAuditLog({
      req,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.fullName,
      actorRole: req.auth!.role?.name || 'Admin',
      action: 'SCHOOL_LOGO_UPLOADED',
      resourceType: 'school_settings',
      resourceId: 'school_primary',
      details: { logoUrl },
      severity: 'info',
    });

    res.json({ logoUrl, settings: updated });
  }
);
