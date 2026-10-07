# Everyday Mental Wellness

Learner portal and admin panel for the Everyday Mental Wellness program. The public website (landing and program pages) is a separate project that links here; this app opens on the sign-in page.

- **App**: Next.js (`src/app`)
- **Database, auth & storage**: Supabase (Postgres, Supabase Auth, Storage)
- **Student portal**: `/student`, where learners sign in with the email and the password they created when activating their account
- **Integrations**: Razorpay (payments), Supabase Auth email over your own SMTP (activation links), Meta WhatsApp Cloud API (phone codes, class reminders), LiveKit (live classes), cron-job.org (scheduled jobs)
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
| `20261005120000_enrollment_lifecycle.sql` | Enrolment states, class times, fees and payments, cohorts, live sessions, attendance, reminders |

Apply them in one of two ways:

- **SQL Editor**: paste each file into Supabase Dashboard → SQL Editor and run the whole file (each ends with `-- END OF FILE`), or
- **Supabase CLI**: `supabase link --project-ref <ref>` then `supabase db push`

### 3. First admin

```bash
npm run admin:create -- you@example.com   # prompts for a password (min 10 chars)
```

This creates the Supabase Auth user (pre-confirmed) and adds it to `public.admins`. Running it again for an existing email resets that user's password.

### 4. Integrations

Every key below is optional while developing: a route that needs a missing key answers `503 … is not set up yet` and the rest of the app keeps working. All variables are listed in `.env.example`.

| Service | Set in `.env.local` | Also do |
|---|---|---|
| App URL | `NEXT_PUBLIC_APP_URL` | Used for every link in emails (activation, sign-in, class join) |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Nothing else. The app sends every learner email itself (activation and sign-in links, both class reminders); Supabase only creates the one-time link and sends nothing. Wording lives in [`src/lib/emails.js`](src/lib/emails.js) |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Webhook to `<APP_URL>/api/webhooks/razorpay` with events `payment.captured`, `payment.failed`, `order.paid` |
| WhatsApp (off at launch) | `WHATSAPP_ENABLED=true`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `PHONE_CODE_SECRET`, template names | Get two templates approved: an **Authentication** template (`emw_verification_code`, copy-code button) and a **Utility** template (`emw_class_starting`, body `Hi {{1}}, your live class begins in 2 minutes. Lesson: {{2}}`, URL button `<APP_URL>/student/live/{{1}}`) |
| LiveKit | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Webhook to `<APP_URL>/api/webhooks/livekit` |
| cron-job.org | `CRON_SECRET` | Two jobs with header `Authorization: Bearer <CRON_SECRET>`: `<APP_URL>/api/cron/reminders` every minute, `<APP_URL>/api/cron/sessions` every 5 minutes |

### 5. Run

```bash
npm run dev
```

- Sign in (opens at `/`): http://localhost:3000
- Registration form: http://localhost:3000/register
- Student portal: http://localhost:3000/student
- Admin panel: http://localhost:3000/admin

Other scripts: `npm run build`, `npm start`, `npm run lint`.

## Features

### Entry points

- `/` redirects to the student sign-in page (`/student/login`), which links to admin sign-in.
- Interest form (`/register`): name, email, WhatsApp and program. No password and no payment. It emails a single-use activation link.

### Learner journey

`invited → activated → payment_pending → enrolled → cohort_assigned → active → program_complete → certified` (stored in `registrations.state`).

1. **Activation** (`/activate`): the emailed link signs the learner in through `/auth/confirm`. They create their password, confirm their WhatsApp number with a 6-digit code and accept the terms.
2. **Payment** (`/student/enroll/[id]`): Razorpay checkout for the group's fee (`groups.fee_paise`). A failed payment keeps the enrolment in `payment_pending` with a Retry button. Free groups skip this step.
3. **Class time**: the learner picks a weekly time (`time_slots`). Choosing one assigns the cohort (e.g. `GROUP1-SUN-1800-C01`) and seat, and course content opens.
4. **Live classes** (`/student/live/[sessionId]`): one session per cohort per released week, on the cohort's class time. The join token is issued only to members of that cohort, from 10 minutes before the start until 20 minutes after the end. LiveKit webhooks record attendance.
5. **Reminders**: an email 4 hours before class and a WhatsApp message with the join link 2 minutes before.

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
             ├─ /register ──> POST /api/interest ──(service role)──> invite email (Supabase Auth), create_interest()
             ├─ /auth/confirm ──> verify emailed link ──> /activate ──> POST /api/account/phone-code, /api/account/activate
             ├─ /student/enroll ──> POST /api/payments/order | verify | failed ──> Razorpay; /api/webhooks/razorpay
             ├─ /student/live ──> POST /api/live/token ──> LiveKit; /api/webhooks/livekit ──> record_live_event()
             ├─ cron-job.org ──> /api/cron/reminders (email + WhatsApp), /api/cron/sessions (schedule + close rooms)
             ├─ GET /api/groups ──────────────────(service role)──> open groups + seat counts
             ├─ /student/* ──(student's session)──> student_dashboard(), student_course(), student_set_class_completed()
             │    └─ POST /api/student/video-url ──> student_video_source() check, then signed Storage URL (service role)
             └─ /admin/* ──(admin's session, RLS)──> groups/curriculum tables, admin_*() functions
```

### Security model

- **Public visitors** have no direct database access. The interest form goes through a route handler that validates input and calls `create_interest()` with the service-role key. New emails get an invite; existing accounts get a sign-in link, and the answer is the same either way so the form does not reveal who has an account.
- **Payments** are confirmed by the checkout signature and again by the signed Razorpay webhook. A paid payment is never turned back to failed.
- **Live class links** are not permanent: `/student/live/[id]` asks the server for a LiveKit token, which is only issued to the session's cohort inside the join window and expires when the window closes. Only staff tokens can end the class.
- **Webhooks and cron** endpoints check signatures (Razorpay, LiveKit) or the `CRON_SECRET` bearer token.
- **Students** have no table access. They use the `student_*()` functions, which only act on registrations where `user_id` is the caller. Unreleased weeks and draft classes are never returned.
- **Admins** sign in with Supabase Auth. Row-level security allows access only when the user has a row in `public.admins`. Admins change registrations only through narrow functions such as `admin_set_student_status()`.
- **Attendance** is written by the database inside the `student_*()` functions, so it can't be faked from the browser. Repeat plays of the same video within one minute count once.
- **Class videos** are in a private bucket. Only admins can upload, and students get short-lived signed links after the database checks their enrollment and the week's release.
- `student_choose_slot()` takes an advisory lock per group and class time, so two learners never get the same seat. Room sizes can't be changed after people have registered.
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
| `src/lib/programs.js` | Time slots, participation styles, fallback group list |
| `src/lib/registrationValidation.js` | Registration input validation |
| `src/app/api/interest`, `src/app/api/groups` | Public API route handlers |
| `src/app/api/account`, `payments`, `live`, `webhooks`, `cron` | Activation, Razorpay, LiveKit, webhooks and scheduled jobs |
| `src/lib/integrations/` | Razorpay, WhatsApp, LiveKit, SMTP and cron clients (server-only) |
| `src/app/api/student/video-url` | Signed video URLs for students |
| `src/app/student/` | Student portal UI |
| `src/app/admin/` | Admin panel UI |
| `src/components/everyday/` | Header and footer for the signed-out pages |
| `scripts/create-admin.mjs` | Create an admin or reset their password |

### Managing admins

- **Add**: `npm run admin:create -- email@example.com`
- **Change password**: sign in and use **Settings** in the admin panel, or rerun the script.
- **Remove access**: delete their row from `public.admins`, or delete the user under Authentication → Users.
- **Disable public sign-ups**: turn off "Allow new users to sign up" under Authentication → Sign In / Providers. Student logins are created by the registration API with the service-role key and admin accounts by the script, so neither needs public sign-up.
