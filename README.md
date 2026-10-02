# Everyday Mental Wellness

Public website, registration, student portal and admin panel for the Everyday Mental Wellness program.

- **App**: Next.js (`src/app`)
- **Database, auth & storage**: Supabase (Postgres, Supabase Auth, Storage)
- **Student portal**: `/student`, where students sign in with the email and password they chose when registering
- **Admin panel**: `/admin`, where admins sign in with email and password

Requires **Node.js 22.13+**. See [RELEASE_NOTES.md](RELEASE_NOTES.md) for what's in each release.

## Setup

### 1. Environment

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` from **Supabase Dashboard → Project Settings → API**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key (server-only, never commit) |

### 2. Database

Apply the files in [`supabase/migrations/`](supabase/migrations) **in filename order**:

| Migration | Adds |
|---|---|
| `20260930120000_registrations_and_admins.sql` | Registrations, admins, seat assignment, RLS |
| `20261003120000_groups_and_classes.sql` | Admin-managed groups, weeks, classes, videos, private `class-videos` bucket |
| `20261003140000_student_status.sql` | Active / completed status per student |
| `20261003160000_student_portal.sql` | Student accounts linked to registrations, class progress, `student_*()` functions |
| `20261003180000_student_activity.sql` | Activity log, attendance, admin student profile |

Apply them in one of two ways:

- **SQL Editor**: paste each file into Supabase Dashboard → SQL Editor and run the whole file (each ends with `-- END OF FILE`), or
- **Supabase CLI**: `supabase link --project-ref <ref>` then `supabase db push`

### 3. First admin

```bash
npm run admin:create -- you@example.com   # prompts for a password (min 10 chars)
```

This creates the Supabase Auth user (pre-confirmed) and adds it to `public.admins`. Running it again for an existing email resets that user's password.

### 4. Run

```bash
npm run dev
```

- Landing page: http://localhost:3000
- Registration form: http://localhost:3000/register
- Student portal: http://localhost:3000/student
- Admin panel: http://localhost:3000/admin

Other scripts: `npm run build`, `npm start`, `npm run lint`.

## Features

### Public site

- Landing page with hero video and program tiles with voice previews, plus a page for each program at `/programs/[slug]`.
- Registration (`/register`) loads open groups from the database, assigns a cohort and seat, and creates the student's login.

### Student portal

- Dashboard of the student's groups with cohort, seat, time slot and progress.
- Course view week by week. A week opens on its release date (India time), and draft or unreleased content stays hidden.
- Videos play from the private bucket through signed links that last one hour, or from external `https://` links.
- Students mark classes complete, and the course completes on its own when every published class is done.

### Admin panel

- **Registrations**: search, view details, export to CSV.
- **Groups**: create and edit groups and their weekly curriculum (weeks, classes, videos).
- **Students**: Active and Completed lists for each group, plus a profile for each student with progress by week, attended days and recent activity.
- **Settings**: change the admin password.

## How it fits together

```
Browser ──> Next.js
             ├─ /register ──> POST /api/register ──(service role)──> create/verify login, register_participant()
             ├─ GET /api/groups ──────────────────(service role)──> open groups + seat counts
             ├─ /student/* ──(student's session)──> student_dashboard(), student_course(), student_set_class_completed()
             │    └─ POST /api/student/video-url ──> student_video_source() check, then signed Storage URL (service role)
             └─ /admin/* ──(admin's session, RLS)──> groups/curriculum tables, admin_*() functions
```

### Security model

- **Public visitors** have no direct database access. Registrations go through the Next.js route handler, which validates input, creates or verifies the student's login, and calls `register_participant()` with the service-role key. An existing account is only linked when the password matches that account.
- **Students** have no table access. They use the `student_*()` functions, which only act on registrations where `user_id` is the caller. Unreleased weeks and draft classes are never returned.
- **Admins** sign in with Supabase Auth. Row-level security allows access only when the user has a row in `public.admins`. Admins change registrations only through narrow functions such as `admin_set_student_status()`.
- **Attendance** is written by the database inside the `student_*()` functions, so it can't be faked from the browser. Repeat plays of the same video within one minute count once.
- **Class videos** are in a private bucket. Only admins can upload, and students get short-lived signed links after the database checks their enrollment and the week's release.
- `register_participant()` takes an advisory lock per group and time slot, so concurrent sign-ups never get the same seat. Room sizes can't be changed after people have registered.
- `src/proxy.js` refreshes the auth session and redirects signed-out visitors away from `/admin/*` and `/student/*` to the matching login page. The database is what actually enforces access.

### Key files

| Path | Purpose |
|---|---|
| `supabase/migrations/` | Tables, RLS policies, database functions, storage bucket |
| `src/proxy.js` | Session refresh and login redirects for `/admin` and `/student` |
| `src/lib/supabase/client.js` | Browser Supabase client |
| `src/lib/supabase/server.js` | Server Supabase client bound to the caller's session |
| `src/lib/supabase/service.js` | Server-only service-role client (route handlers) |
| `src/lib/adminApi.js`, `src/lib/adminContent.js` | Admin panel data helpers |
| `src/lib/studentApi.js` | Student portal data helpers |
| `src/lib/programs.js`, `src/lib/programPages.js` | Time slots, participation styles, program page copy |
| `src/lib/registrationValidation.js` | Registration input validation |
| `src/app/api/register`, `src/app/api/groups` | Public API route handlers |
| `src/app/api/student/video-url` | Signed video URLs for students |
| `src/app/student/` | Student portal UI |
| `src/app/admin/` | Admin panel UI |
| `src/components/everyday/` | Landing page components |
| `scripts/create-admin.mjs` | Create an admin or reset their password |

### Managing admins

- **Add**: `npm run admin:create -- email@example.com`
- **Change password**: sign in and use **Settings** in the admin panel, or rerun the script.
- **Remove access**: delete their row from `public.admins`, or delete the user under Authentication → Users.
- **Disable public sign-ups**: turn off "Allow new users to sign up" under Authentication → Sign In / Providers. Student logins are created by the registration API with the service-role key and admin accounts by the script, so neither needs public sign-up.
