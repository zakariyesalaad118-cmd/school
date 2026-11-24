import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createBackendApp } from './backend/src/app.ts';
import { connectDatabase } from './backend/src/config/database.ts';
import { env } from './backend/src/config/env.ts';
import { ensureSystemSeeded } from './backend/src/services/bootstrapService.ts';

async function startServer() {
  await connectDatabase();
  await ensureSystemSeeded();

  const app = createBackendApp();

  if (env.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[NEXUS SCHOOL OS] Running on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
  });
}

startServer().catch((err) => {
  console.error('[NEXUS SERVER] Fatal startup error:', err);
  process.exit(1);
});
