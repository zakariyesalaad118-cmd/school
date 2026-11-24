import crypto from 'node:crypto';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';

export interface AccessTokenPayload {
  sub: string;
  roleId: string;
  isSuperAdmin: boolean;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) {
    return false;
  }
  const [, salt, originalHex] = parts;
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHex, 'hex');
  if (derivedBuffer.length !== originalBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuffer, originalBuffer);
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.jwtSecret, { expiresIn: '2h' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
  if (decoded.type !== 'access' || !decoded.sub) {
    throw new Error('Invalid access token');
  }
  return decoded;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh' || !decoded.sub) {
    throw new Error('Invalid refresh token');
  }
  return decoded;
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function sanitizeString(val: unknown): string {
  if (typeof val !== 'string') {
    return '';
  }
  return val.trim();
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function validateRasterLogoDataUrl(dataUrl: string): {
  valid: boolean;
  ext?: 'png' | 'jpg' | 'webp';
  buffer?: Buffer;
  error?: string;
} {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    return { valid: false, error: 'Logo must be a valid PNG, JPG, or WEBP image.' };
  }
  const mimeSubtype = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > 1024 * 1024) {
    return { valid: false, error: 'Logo image size must be under 1 MB.' };
  }

  // Verify magic bytes to ensure actual raster image format.
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (mimeSubtype === 'png' && isPng) return { valid: true, ext: 'png', buffer };
  if ((mimeSubtype === 'jpeg' || mimeSubtype === 'jpg') && isJpg) return { valid: true, ext: 'jpg', buffer };
  if (mimeSubtype === 'webp' && isWebp) return { valid: true, ext: 'webp', buffer };

  return { valid: false, error: 'Uploaded file header does not match image type.' };
}
