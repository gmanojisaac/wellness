'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentAuthError, getDashboard } from '../../../lib/studentApi';
import { plural } from '../../../lib/plural';

export default function StudentDashboardPage() {
  const router = useRouter();
  const [enrolments, setEnrolments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setEnrolments).catch((err) => {
      if (err instanceof StudentAuthError) router.replace('/student/login');
      else setError(err.message);
    });
  }, [router]);

  return (
    <>
      <div className="sp-page-head">
        <span className="eyebrow">STUDENT PORTAL</span>
        <h1>My classes</h1>
        <p className="sp-muted">The groups you are registered for. Open one to watch this week&rsquo;s classes.</p>
      </div>

      {error && <div className="sp-alert" role="alert">{error}</div>}
      {!enrolments && !error && <p className="sp-muted sp-loading" role="status">Loading your classes…</p>}

      {enrolments?.length === 0 && (
        <div className="sp-card sp-empty">
          <h2>No classes yet</h2>
          <p className="sp-muted">This account is not registered for a group yet.</p>
          <Link href="/register" className="register-button">Register for a group</Link>
        </div>
      )}

      <div className="sp-grid">
        {enrolments?.map((e) => {
          const percent = e.totalClasses > 0 ? Math.round((e.completedClasses / e.totalClasses) * 100) : 0;
          const completed = e.status === 'completed';
          return (
            <article key={e.id} className="sp-card sp-course-card">
              <div className="sp-card-top">
                <span className={`sp-badge ${completed ? 'is-completed' : ''}`}>{completed ? 'Completed' : 'Active'}</span>
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
                <div><dt>Session</dt><dd>{e.timeSlotLabel}</dd></div>
                <div><dt>Room</dt><dd>{e.cohortCode} · Seat {e.seatNumber} of {e.roomCapacity}</dd></div>
              </dl>

              <Link href={`/student/course/${e.id}`} className="register-button sp-block">
                {completed ? 'Review classes' : e.completedClasses > 0 ? 'Continue' : 'Start'}
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}
