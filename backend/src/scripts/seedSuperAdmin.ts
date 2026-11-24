import { connectDatabase } from '../config/database.ts';
import { env } from '../config/env.ts';
import {
  createInitialSuperAdmin,
  ensureSystemSeeded,
  isInitialSetupRequired,
} from '../services/bootstrapService.ts';

async function runSeed() {
  await connectDatabase();
  await ensureSystemSeeded();

  const needsSetup = await isInitialSetupRequired();
  if (!needsSetup) {
    console.log('[NEXUS SEED] Super Admin already exists. Setup script skipped.');
    process.exit(0);
  }

  if (!env.initialSuperAdmin.email || !env.initialSuperAdmin.password) {
    console.error(
      '[NEXUS SEED] Missing INITIAL_SUPER_ADMIN_EMAIL or INITIAL_SUPER_ADMIN_PASSWORD environment variables.'
    );
    process.exit(1);
  }

  const user = await createInitialSuperAdmin({
    fullName: env.initialSuperAdmin.fullName,
    email: env.initialSuperAdmin.email,
    username: env.initialSuperAdmin.username,
    password: env.initialSuperAdmin.password,
    source: 'cli-seed',
  });

  console.log(`[NEXUS SEED] Initial Super Admin created: ${user.email} (${user.username})`);
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('[NEXUS SEED] Failed:', err);
  process.exit(1);
});
