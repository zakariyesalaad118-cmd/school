# NEXUS SCHOOL OS — Phase 1 Foundation

**Tagline:** One School. One Intelligence. One Connected Future.  
**Default School:** SOMALI PRIMERY AND SECONDARY SCHOOL

## Phase 1 Implemented Capabilities

- **Dual-Mode Database Layer:** Connects automatically to **MongoDB Atlas** when `MONGODB_URI` is set, or runs on an atomic persistent local document store (`backend/data/nexus-db.json`) for zero-dependency preview & local development.
- **Hardened Authentication & Initial Super Admin Setup:**
  - Public self-registration is disabled.
  - First-run Super Admin initialization via `INITIAL_SUPER_ADMIN_*` environment variables (`npm run seed:admin`) or the one-time interactive setup screen (`POST /api/auth/bootstrap`), which locks permanently once claimed.
  - Salted `crypto.scrypt` password hashing, JWT access tokens kept in client memory + `HttpOnly` refresh session cookie, temporary password enforcement on first login, sliding-window login rate limiting, and password re-authentication for privileged Super Admin actions.
- **Dynamic Role & Permission Engine:** Create, edit, activate/deactivate, and safely delete custom roles with a 19-module × 9-action backend-enforced RBAC matrix.
- **Department Architecture:** Dynamic departments with assigned managers, staff/role counters, and dependency-safe deletion checks.
- **Dynamic Dashboard Builder:** Super Admins configure role-linked or user-linked dashboards using a catalog of predefined, permission-checked widgets and Recharts analytics.
- **Complete Bilingual Support (English & Somali):** Powered by `i18next` with per-user language persistence.
- **Dual Theme (Light, Dark & System):** Tailwind CSS v4 custom dark variant with per-user theme persistence.
- **Dynamic School Branding Studio:** Live customization of school name, slogan, contact details, palette CSS tokens, and validated raster logo uploads (`PNG`, `JPG`, `WEBP`).

## Environment Variables

See `.env.example` for all supported variables:
- `MONGODB_URI` — MongoDB Atlas connection string (optional in preview/local dev).
- `INITIAL_SUPER_ADMIN_EMAIL`, `INITIAL_SUPER_ADMIN_USERNAME`, `INITIAL_SUPER_ADMIN_PASSWORD`, `INITIAL_SUPER_ADMIN_NAME` — Optional initial Super Admin seed credentials.
- `CORS_ORIGIN` — Comma-separated allowed frontend origins for production (e.g., Cloudflare Pages URL).
- `APP_URL` — Hosted service URL.

## Scripts

- `npm run dev` — Starts unified Express + Vite server on port `3000`.
- `npm run build` — Builds the Vite frontend into `dist/`.
- `npm run start` — Runs the production Express server serving `dist/` and `/api/*`.
- `npm run lint` — Runs TypeScript typechecking (`tsc --noEmit`).
- `npm run seed:admin` — Seeds the initial Super Admin from environment variables.
