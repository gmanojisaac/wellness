# Release Notes

## Everyday Mental Wellness 0.3.0 (unreleased, 2026-10-07)

This release gets the app ready for launch. The first learners (about 100) will enrol free with a promo code instead of paying, and every message to learners will go by email. Razorpay payments and WhatsApp messaging are still in the app and can each be switched on later without code changes.

### Highlights

- **Promo-code enrolment**: an admin switches between enrolling by **promo code** and by **Razorpay payment**, and creates the codes. A valid code enrols the learner for free.
- **Email only at launch**: the app sends every learner email itself through your SMTP account. This covers activation links, sign-in links and both class reminders. WhatsApp is switched off.

### Promo codes

- **Admin → Promo codes** (`/admin/promo-codes`), a new item in the sidebar:
  - **How learners enrol**: choose **Promo code** or **Razorpay payment**. It starts on **Promo code**. You confirm before the switch takes effect.
  - **Create codes**:
    - Choose the code itself (for example `EMWFIRST100`).
    - Add an optional note that only admins see.
    - Make it valid for all groups or for one group.
    - Set a maximum number of uses (100 by default; leave it empty for unlimited).
    - Set an optional expiry date. The code works through the end of that day, India time.
  - **Manage codes**: edit, deactivate or reactivate a code. A code that has been used can't be deleted, only deactivated, so the record of who used it is kept.
  - **Who used a code**: click the "Used" count to see each learner who used it, with a link to their profile.
  - The page warns you when promo codes are on but no code is active, because nobody can enrol then.
- **Learner** (`/student/enroll/[id]`):
  - While promo codes are on, the enrolment step asks for a promo code instead of showing the pay button. Codes work in any letter case.
  - A valid code enrols the learner straight away, and they go on to choose their weekly class time.
  - Clear messages for a wrong, expired or used-up code.
- **Safeguards**:
  - The database checks every code: one use per enrolment, use limits, expiry, group, and whether promo codes are switched on.
  - When two learners try to take the last use of a code at the same moment, only one gets it.
  - While promo codes are on, the server refuses to start a Razorpay payment, even if someone calls it directly.
- The dashboard now says **Complete enrolment** and **Enrolment pending** instead of "Complete payment" and "Payment pending", because nobody pays at launch.

### Email only

- **Activation and sign-in links**:
  - Supabase now only creates the single-use link and sends nothing. The app emails the link through `SMTP_*` in `.env`.
  - The interest form won't create an account unless SMTP is set up. Until then it answers "not set up yet".
  - If the activation email fails to send, the learner's registration is kept and they are asked to try again. **Send me a new link** on `/activate` also works.
- **Class reminders**: both now go by email:
  - "Your class is today": 4 hours before.
  - "Your live class starts in 2 minutes": with the join link. Before this release it went by WhatsApp.
- **Activation page**: while WhatsApp is off, there's no WhatsApp code step; the phone number is just saved. Learners can still opt in to WhatsApp reminders "when they start", so you have their consent for later.
- **Email wording**: all four emails are in `src/lib/emails.js`. Learner names in them are HTML-escaped.
- **WhatsApp**: stays off until `WHATSAPP_ENABLED=true` and the Meta keys are set. Turning it on brings back the WhatsApp code at activation and sends the 2-minute reminder on WhatsApp. Activation emails and the 4-hour reminder stay on email.

### Database

New migration `20261007120000_promo_codes.sql`. It can be run more than once safely. It needs `20261005120000_enrollment_lifecycle.sql` to be applied first.

- `app_settings`: a single row holding the promo-code switch (`promo_checkout_enabled`, on by default).
- `promo_codes`: the codes, with their use count, limit, expiry, optional group and active flag.
- `promo_redemptions`: who used which code and when (one per enrolment).
- `student_redeem_promo()`: enrols the signed-in learner's own registration with a code.
- `promo_checkout_enabled()`: tells the app whether promo codes are on.
- Only admins can read or change settings, codes and redemptions. Learners can only redeem a code for their own enrolment.

### Upgrading

1. In the Supabase SQL editor, run `20261005120000_enrollment_lifecycle.sql` (if it isn't applied yet), then `20261007120000_promo_codes.sql`.
2. Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in the deployment environment, and set `WHATSAPP_ENABLED=false`. For Gmail or Google Workspace, use `smtp.gmail.com` on port 465 with an App Password.
3. You no longer need to set up SMTP or email templates in the Supabase dashboard. The files in `supabase/templates/` are kept for reference only.
4. In **Admin → Promo codes**, create the launch code (for example `EMWFIRST100`, 100 uses) and include it in the invitation email you send.
5. **Later, to start taking payments**: add the Razorpay keys and switch **How learners enrol** to **Razorpay payment**. **Later, to start WhatsApp**: add the Meta keys and approved templates, then set `WHATSAPP_ENABLED=true`.

### Known limitations

- No real email has been sent yet, because the SMTP keys aren't set. The promo-code database rules were tested in an in-memory Postgres; the admin and enrolment screens haven't been tried against a live Supabase project.
- The promo code isn't added to the activation email automatically. Include it in the invitation you send.
- A code makes enrolment completely free. Partial discounts aren't supported.
- The admin registrations list doesn't show which promo code a learner used yet. That is shown on the Promo codes page instead.

## Everyday Mental Wellness 0.2.0 (unreleased, 2026-10-05)

This release lines the app up with the Learner Experience Spec v1.0. It changes how learners join, from a single registration form to the spec's journey: interest form, activation email, payment, class time, cohort, and live classes with reminders. It adds the Razorpay, email (SMTP), WhatsApp, LiveKit and cron-job.org integrations, and narrows the app to the learner portal and admin panel. The public website is now a separate project.

### Highlights

- **New learner journey**: interest form → activation email → set password, confirm WhatsApp, accept terms → payment → choose a weekly class time → cohort assigned → live classes.
- **Integrations** for Razorpay payments, email, the WhatsApp Cloud API, LiveKit live video and cron-job.org scheduled jobs. Each one stays switched off until its keys are added to `.env.local`. Until then, its endpoints answer "not set up yet" and the rest of the app keeps working.
- **Portal only**: the landing page, program and course pages, and the old demo pages are gone. The app opens on the sign-in page.

### Learner journey

- **Interest form** (`/register`): name, email, WhatsApp number and program. No password and no payment. It sends a single-use activation link through Supabase Auth. People who already have an account get a sign-in link instead, and the page gives the same answer either way, so it never reveals who has an account.
- **Activation** (`/activate`):
  - The emailed link signs the learner in through `/auth/confirm`.
  - They create their own password, confirm their mobile number with a 6-digit WhatsApp code, choose whether to get WhatsApp reminders, and accept the terms and privacy notice. The terms version and the time of consent are saved.
  - If the link has expired, the page lets them request a new one.
- **Payment** (`/student/enroll/[id]`):
  - Razorpay checkout for the program fee.
  - Payments are confirmed by the checkout signature and again by the signed Razorpay webhook. A paid payment is never turned back to failed.
  - If a payment fails, the account and program stay saved and the learner sees **Retry payment**.
  - Programs with no fee skip this step.
- **Class time**: the learner picks a weekly time and sees how many seats are left. Confirming it assigns a cohort (for example `GROUP1-SUN-1800-C01`) and a seat, then shows "You're in."
- **Dashboard** (`/student`):
  - The next live class, labelled Upcoming, Join available or Live now.
  - Each program's next step: activate, pay or choose a class time.
  - Course content opens only once a cohort is assigned.

### Live classes (LiveKit)

- Each cohort gets one live session per released curriculum week, at the cohort's class time.
- `/student/live/[sessionId]` gets a LiveKit token from the server.
  - Tokens go only to members of that session's cohort, from 10 minutes before the start until 20 minutes after the end. The token expires when that window closes, so there are no permanent meeting links.
  - Admin/facilitator tokens can also end the class; learner tokens can't.
- The LiveKit webhook records each learner's attendance (when they joined and how long they stayed). Joining a first class moves the learner from cohort-assigned to active.
- A scheduled job closes rooms whose join window has ended.

### Reminders

- An email 4 hours before each class.
- A WhatsApp message with the secure join link 2 minutes before each class (only for learners who opted in).
- Each reminder is recorded before it is sent, so two overlapping cron runs never send it twice.

### Integrations and setup

- All keys have placeholders, with notes on where to find them, in `.env.local` and `.env.example`. `.env.example` is now tracked in git.
- **Email**: Supabase Auth sends activation and sign-in emails through your own SMTP account. The app sends reminders through the same account. Email templates to paste into Supabase are in `supabase/templates/`.
- **Razorpay**: keys plus a webhook to `/api/webhooks/razorpay`.
- **WhatsApp Cloud API**: two message templates that Meta must approve: a verification code and a "class starting" reminder.
- **LiveKit**: project URL, keys, and a webhook to `/api/webhooks/livekit`.
- **cron-job.org**: `/api/cron/reminders` every minute and `/api/cron/sessions` every 5 minutes. Both require the header `Authorization: Bearer <CRON_SECRET>`.
- The README has the full setup table.

### Database

New migration `20261005120000_enrollment_lifecycle.sql`. It can be run more than once safely.

- **Enrolment stage** (`registrations.state`): `invited → activated → payment_pending → enrolled → cohort_assigned → active → program_complete → certified`, plus `withdrawn`, `account_locked` and `certificate_review`. Existing registrations become `active`, or `program_complete` if they were completed.
- **Class times** move from code into a `time_slots` table. Class time, cohort and seat are now chosen after payment instead of at registration.
- **Program fees** on groups. The Adult program is set to ₹14,999, as in the spec. The other programs are free until a fee is set.
- **New tables**:
  - `payments`
  - `phone_verifications` (codes are stored hashed)
  - `class_sessions`
  - `session_attendance`
  - `notification_log`
- `student_course` and `student_video_source` now require an assigned cohort.

### Removed

- The landing page, the program pages (`/programs/*`) and the content pages: `/courses`, `/tracks`, `/how-it-works`, `/comic-method`, `/faq`, `/safety`, `/daily-checkin`.
- The demo pages that stored data in the browser: `/checkout`, `/classroom`, `/certificate`, `/schedule`, `/notifications`, `/progress`, `/enroll`, `/profile`, `/settings`.
- The `/api/register` endpoint. The interest form uses `/api/interest`.
- The components, data files, scripts and media (videos, audio and images) used only by those pages.

### Upgrading

1. Apply `20261005120000_enrollment_lifecycle.sql` **before** deploying this code. The new interest form depends on it.
2. In Supabase → Authentication:
   - Set the Site URL to the portal URL and add `<APP_URL>/auth/confirm` to Redirect URLs.
   - Add your SMTP account.
   - Paste the two email templates.
3. Add the integration keys to the deployment environment as each account becomes ready.

### Known limitations

- The real services (Razorpay, the emails, WhatsApp and LiveKit) have not been called yet because no keys are set. The database changes were tested in an in-memory Postgres.
- Fees, class times and live sessions can only be changed in the database for now. There is no admin screen for them yet.
- The admin Students lists show learners who haven't paid yet under **Active**.
- Live sessions are created only for curriculum weeks that have a release date.
- The live classroom uses LiveKit's standard layout. The calmer custom design from the spec comes later.
- Not built yet:
  - Lesson progress rules (lessons are still marked complete by hand)
  - Feedback after class
  - Missed-class make-ups
  - Cohort discussion and messaging
  - Certificates and the public `/verify` page

## Everyday Mental Wellness 0.1.0 (2026-10-03)

This is the first release of the Everyday Mental Wellness platform with a production backend. It covers the public website, registration with student accounts, a student portal for weekly classes, and an admin panel for running groups and following each student's progress.

### Highlights

- **New landing page**: a cinematic "Everyday" design with a hero video, program tiles with voice previews, and an overview page for each program at `/programs/[slug]` (adults, parents, students, employees).
- **Supabase backend**: the old Express server and its local data store are gone. Postgres, Supabase Auth and row-level security now hold the data, and Next.js route handlers serve the API.
- **Student portal** (`/student`): registering creates a student login. Students sign in to see their groups, watch each week's class videos, and mark classes complete.
- **Admin panel** (`/admin`): manage groups and their weekly curriculum, review registrations, track students per group, open a full student profile with attendance, and change the admin password.

### Public website and registration

- The registration page (`/register`) uses the Everyday theme and loads the open groups from the database, so groups added in the admin panel appear without a code change.
- Registering now asks for a password (8 to 72 characters) and creates a student account for that email.
  - If the email already has an account, the registration is added to it only when the password matches that account. This stops anyone from adding a registration to an account they don't own.
  - If the registration fails, a login created during that attempt is removed so no account is left without a registration.
- Seats are given out under a per-group, per-time-slot lock, so two people who register at the same moment never get the same seat. Each group has a fixed room size, and new rooms (cohorts) open as rooms fill.
- Clear messages when a group is closed or the person is already registered for that group.

### Student portal

- `/student/login`: sign in with the email and password used at registration.
- `/student`: a dashboard of the student's groups with cohort, seat, time slot and progress.
- `/student/course/[registrationId]`: the course week by week. A week opens on its release date (India time). Draft classes and weeks that haven't been released yet are hidden.
- Videos play through links that last one hour, created by the server for the private `class-videos` bucket. External video links are also supported.
- Students mark classes complete. A course moves to **Completed** on its own once every published class is done, and goes back to **Active** if a class is unmarked.

### Admin panel

- **Groups**: create and edit groups (title, description, duration, cadence, room size, open or closed for registration). You can't change a room size after people have registered, because that would hand out duplicate seats.
- **Curriculum**: weeks with release dates, classes, and videos (uploaded files or external `https://` links).
- **Students tab** for each group, with Active and Completed lists, search, and a way to mark students completed.
- **Student profile** (`/admin/students/[registrationId]`): registration details, progress by week, the days they attended, and recent activity.
- **Registrations**: a searchable list with a details drawer and CSV export.
- **Settings**: change the admin password. You have to enter the current password, and the new one needs at least 10 characters.
- Confirmation prompts now open inside the page instead of using the browser's `confirm()`, which embedded browsers block.

### Attendance

- The database logs each video play and class completion itself, so attendance can't be faked from the browser.
- Opening the same video again within one minute (a refresh or a double click) counts as one play.
- An attended day is a calendar day (India time) with at least one logged activity.

### Security

- Public visitors have no direct database access. Registration and the group list go through server route handlers that use the service-role key.
- Admins can read data only when they have a row in `public.admins` (enforced by row-level security). Admins change students only through narrow database functions.
- Students have no table access. Everything goes through `student_*()` functions that only act on the signed-in student's own rows.
- `src/proxy.js` keeps sessions fresh and sends signed-out visitors to the right login page for `/admin` and `/student`. The database is what actually enforces access.

### Upgrading

Apply these migrations in order. Each one after the first can safely be run more than once. Run every file in full; each ends with `-- END OF FILE`.

1. `20260930120000_registrations_and_admins.sql`
2. `20261003120000_groups_and_classes.sql`
3. `20261003140000_student_status.sql`
4. `20261003160000_student_portal.sql`
5. `20261003180000_student_activity.sql`

After that:

- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment.
- Create the first admin with `npm run admin:create -- you@example.com`.
- Because the registration API creates student accounts, you can turn off public sign-ups in Supabase Auth.

### Known limitations

- Registrations made before the student portal migration have no linked student account (`registrations.user_id` is empty), so they don't appear in anyone's portal. Linking them has to be done by hand in the database for now.
- There is no password reset for students yet.
- The app has no automated test suite yet.
