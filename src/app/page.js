import { redirect } from 'next/navigation';

// This app is the learner and admin portal only; the public website is a separate
// project that links here. Everyone starts at the sign-in page.
export default function HomePage() {
  redirect('/student/login');
}
