# One Stop

A private, family-focused financial hub. Consolidates account balances, investing research, and a contingency guide into a single app.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL (raw `pg` driver)
- **Auth**: NextAuth.js v4 — credentials provider, JWT sessions
- **Styling**: Vanilla CSS + shadcn/ui
- **Data fetching**: TanStack React Query v5
- **Forms**: React Hook Form + Zod

## Prerequisites

- Node.js 20+
- PostgreSQL 13+

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Create the database and user (values from `.env`):

```bash
psql postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
psql postgres -c "CREATE DATABASE onestop OWNER $DB_USER;"
```

Run the auth migration:

```bash
psql $DATABASE_URL -f db/migrations/001_auth.sql
```

Bootstrap the admin user (update email/password as needed):

```bash
node -e "
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
bcrypt.hash('yourpassword', 12).then(hash => {
  return pool.query('INSERT INTO users (email, password_hash, role) VALUES (\$1, \$2, \$3)', ['you@example.com', hash, 'admin']);
}).then(() => { console.log('Admin created'); pool.end(); });
"
```

### 3. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env .env.local
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DB_USER` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | JWT signing secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App origin (e.g. `http://localhost:3000`) |
| `EMAIL_FROM` | From address for outgoing emails |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |

For local email testing, use [Ethereal](https://ethereal.email) — create a free account and paste the SMTP credentials. Sent emails won't leave Ethereal; a preview URL is logged to the console.

**Production note:** Gmail SMTP works for personal/dev use but is not suitable for production (rate limits, deliverability). Before deploying, migrate to [Resend](https://resend.com) — create an account, verify your sending domain, and swap the nodemailer transport in `lib/email.ts` for the Resend SDK (`npm install resend`). Update the env vars accordingly (`RESEND_API_KEY`, `EMAIL_FROM` set to your verified domain address).

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |

## Running Tests

Unit tests use **Jest** and **React Testing Library**. All tests live in `__tests__/`.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run a specific test file
npm test -- __tests__/lib/tokens.test.ts

# Run tests matching a name pattern
npm test -- --testNamePattern="authorizeUser"

# Run with coverage report
npm test -- --coverage
```

### Test structure

```
__tests__/
├── lib/
│   ├── auth.test.ts       # authorizeUser logic, JWT/session callbacks
│   └── tokens.test.ts     # invite token and password reset token utilities
└── api/
    └── auth/
        ├── invite.test.ts          # POST /api/auth/invite
        ├── register.test.ts        # POST /api/auth/register
        ├── forgot-password.test.ts # POST /api/auth/forgot-password
        └── reset-password.test.ts  # POST /api/auth/reset-password
```

All tests mock the database and external services (email) — no live database or SMTP connection is required to run them.

## Project Structure

```
app/
├── (auth)/          # Login, register, forgot/reset password pages
├── api/auth/        # NextAuth + auth API routes
└── dashboard/       # (upcoming) Financial dashboard

lib/
├── auth.ts          # NextAuth config + authorizeUser function
├── db.ts            # PostgreSQL pool singleton
├── email.ts         # Nodemailer transport + send helpers
└── tokens.ts        # Invite and password reset token utilities

db/
└── migrations/      # Raw SQL migration files

components/
└── Providers.tsx    # SessionProvider + QueryClientProvider

types/
└── next-auth.d.ts   # Module augmentation (role, id on session/JWT)

middleware.ts        # Route protection + role-based redirects
```

## User Roles

| Role | Access |
|------|--------|
| **Admin** | Full read/write across all sections |
| **Spouse** | Read-only on Dashboard and Contingency; no access to Investing by default |

The admin can invite the spouse via **Settings → Generate Invite Link**. Invite links expire after 72 hours and are single-use.
