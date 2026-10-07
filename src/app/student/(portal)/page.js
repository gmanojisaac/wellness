'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentAuthError, getDashboard, getUpcomingSessions } from '../../../lib/studentApi';
import { STATE_LABELS, formatSessionTime, hasCourseAccess, nextStep } from '../../../lib/lifecycle';
import { plural } from '../../../lib/plural';

export default function StudentDashboardPage() {
  const router = useRouter();
  const [enrolments, setEnrolments] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setEnrolments).catch((err) => {
      if (err instanceof StudentAuthError) router.replace('/student/login');
      else setError(err.message);
    });
    getUpcomingSessions().then(setSessions).catch(() => setSessions([]));
  }, [router]);

  const nextSession = sessions[0];

  return (
    <>
      <div className="sp-page-head">
        <span className="eyebrow">STUDENT PORTAL</span>
        <h1>My classes</h1>
        <p className="sp-muted">Your programs, your next live class and your progress.</p>
      </div>

      {error && <div className="sp-alert" role="alert">{error}</div>}
      {!enrolments && !error && <p className="sp-muted sp-loading" role="status">Loading your classes…</p>}

      {nextSession && <NextLiveClass session={nextSession} />}

      {enrolments?.length === 0 && (
        <div className="sp-card sp-empty">
          <h2>No classes yet</h2>
          <p className="sp-muted">This account is not registered for a group yet.</p>
          <Link href="/register" className="register-button">Register for a group</Link>
        </div>
      )}

      <div className="sp-grid">
        {enrolments?.map((e) => (hasCourseAccess(e.state) ? <CourseCard key={e.id} e={e} /> : <PendingCard key={e.id} e={e} />))}
      </div>
    </>
  );
}

function NextLiveClass({ session }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const open = now >= new Date(session.joinOpensAt).getTime();
  const live = now >= new Date(session.startsAt).getTime();
  return (
    <section className="sp-card sp-next-class" aria-label="Next live class">
      <div className="sp-card-top">
        <span className="eyebrow">NEXT LIVE CLASS</span>
        <span className={`sp-badge ${open ? '' : 'is-muted'}`}>{live ? 'Live now' : open ? 'Join available' : 'Upcoming'}</span>
      </div>
      <h2>{formatSessionTime(session.startsAt)}</h2>
      <p className="sp-muted">
        {session.groupName} · Week {session.weekNumber}{session.weekTitle ? `: ${session.weekTitle}` : ''}
        {session.cohortCode ? ` · ${session.cohortCode}` : ''}
      </p>
      {open ? (
        <Link href={`/student/live/${session.id}`} className="register-button">Join class</Link>
      ) : (
        <p className="sp-small sp-muted">The join button opens 10 minutes before class. We also send the link on WhatsApp 2 minutes before.</p>
      )}
    </section>
  );
}

function PendingCard({ e }) {
  const step = nextStep(e);
  return (
    <article className="sp-card sp-course-card">
      <div className="sp-card-top">
        <span className="sp-badge is-muted">{STATE_LABELS[e.state] || e.state}</span>
        <span className="sp-muted sp-small">{plural(e.durationWeeks, 'week')}</span>
      </div>
      <h2>{e.groupName}</h2>
      {e.groupTitle && <p className="sp-muted">{e.groupTitle}</p>}
      {step ? (
        <Link href={step.href} className="register-button sp-block">{step.label}</Link>
      ) : (
        <p className="sp-small sp-muted">Please contact the program team about this enrolment.</p>
      )}
    </article>
  );
}

function CourseCard({ e }) {
  const percent = e.totalClasses > 0 ? Math.round((e.completedClasses / e.totalClasses) * 100) : 0;
  const completed = e.status === 'completed';
  return (
    <article className="sp-card sp-course-card">
      <div className="sp-card-top">
        <span className={`sp-badge ${completed ? 'is-completed' : ''}`}>{completed ? 'Completed' : STATE_LABELS[e.state]}</span>
        <span className="sp-muted sp-small">{plural(e.durationWeeks, 'week')}</span>
      </div>
      <h2>{e.groupName}</h2>
      {e.groupTitle && <p className="sp-muted">{e.groupTitle}</p>}

      <div className="sp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Course progress">
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="sp-small sp-muted">
        {e.totalClasses > 0
          ? `${e.completedClasses} of ${plural(e.totalClasses, 'class', 'classes')} completed`
          : 'Classes will appear here once they are published.'}
      </p>

      <dl className="sp-facts">
        <div><dt>Class time</dt><dd>{e.timeSlotLabel}</dd></div>
        <div><dt>Cohort</dt><dd>{e.cohortCode} · Seat {e.seatNumber} of {e.roomCapacity}</dd></div>
      </dl>

      <Link href={`/student/course/${e.id}`} className="register-button sp-block">
        {completed ? 'Review classes' : e.completedClasses > 0 ? 'Continue' : 'Start'}
      </Link>
    </article>
  );
}
