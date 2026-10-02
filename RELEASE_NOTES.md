# Release Notes

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
