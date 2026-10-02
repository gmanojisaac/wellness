'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarCheck, CircleCheck, CircleDashed, Clock, LoaderCircle, Lock, PlayCircle, RotateCcw, TriangleAlert,
} from 'lucide-react';
import { RegistrationDetails } from '../../../../../components/admin/RegistrationDrawer';
import { AdminAuthError, loginRedirectUrl } from '../../../../../lib/adminApi';
import { getStudentProfile, setStudentStatus } from '../../../../../lib/adminContent';
import { plural } from '../../../../../lib/plural';

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const formatDay = (isoDate) => dayFormat.format(new Date(`${isoDate}T00:00:00`));
const ACTIVITY_LABELS = {
  video_played: 'Watched',
  class_completed: 'Completed',
  class_uncompleted: 'Unmarked',
};

// Where a student stands on one class, most advanced state first.
function classState(cls, weekReleased) {
  if (cls.completedAt) return { key: 'done', label: `Completed ${dateTimeFormat.format(new Date(cls.completedAt))}`, Icon: CircleCheck };
  if (cls.plays > 0) return { key: 'watched', label: `Watched, not marked complete`, Icon: PlayCircle };
  if (!weekReleased) return { key: 'locked', label: 'Not released yet', Icon: Lock };
  return { key: 'todo', label: 'Not started', Icon: CircleDashed };
}

function Stat({ label, value, hint, primary }) {
  return (
    <div className={`adm-stat ${primary ? 'adm-stat-primary' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default function StudentProfilePage() {
  const { registrationId } = useParams();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleError = useCallback((err) => {
    if (err instanceof AdminAuthError) router.replace(loginRedirectUrl());
    else setError(err.message);
  }, [router]);

  const reload = useCallback(() => getStudentProfile(registrationId).then((p) => {
    setProfile(p);
    setError('');
  }).catch(handleError), [registrationId, handleError]);

  useEffect(() => { reload(); }, [reload]);

  const changeStatus = async (next) => {
    setSaving(true);
    try {
      await setStudentStatus(registrationId, next);
    } catch (err) {
      handleError(err);
    }
    await reload();
    setSaving(false);
  };

  if (!profile) {
    return (
      <div className="adm-page">
        <Link href="/admin/groups" className="adm-back-link"><ArrowLeft size={15} /> All groups</Link>
        {error
          ? <div className="adm-alert adm-alert-error" role="alert">{error}</div>
          : <LoaderCircle size={24} className="adm-spin adm-muted" aria-label="Loading" />}
      </div>
    );
  }

  const { registration: r, weeks, attendance, recentActivity, hasAccount, summary } = profile;
  const completed = r.status === 'completed';

  return (
    <div className="adm-page">
      <Link href={`/admin/groups/${r.groupId}?tab=students`} className="adm-back-link">
        <ArrowLeft size={15} /> {r.groupName} · Students
      </Link>

      <div className="adm-page-header">
        <div>
          <span className="adm-mono adm-muted">{r.registrationNumber}</span>
          <h1>{r.fullName}</h1>
          <p className="adm-muted">
            <span className={`adm-badge adm-badge-${r.status}`}>{completed ? 'Completed' : 'Active'}</span>
            {' '}{r.groupName} · {r.cohortCode}, seat {r.seatNumber}
          </p>
        </div>
        <div className="adm-page-actions">
          {completed ? (
            <button className="adm-btn adm-btn-ghost" disabled={saving} onClick={() => changeStatus('active')}>
              <RotateCcw size={15} /> Mark active
            </button>
          ) : (
            <button className="adm-btn adm-btn-primary" disabled={saving} onClick={() => changeStatus('completed')}>
              <CircleCheck size={15} /> Mark course completed
            </button>
          )}
        </div>
      </div>

      {error && <div className="adm-alert adm-alert-error adm-page-alert" role="alert">{error}</div>}
      {!hasAccount && (
        <div className="adm-alert adm-alert-warning adm-page-alert" role="status">
          <TriangleAlert size={16} /> This registration has no student login, so the student cannot open the portal and no attendance can be recorded.
        </div>
      )}

      <div className="adm-stats adm-profile-stats">
        <Stat primary label="Course progress" value={`${summary.percent}%`} hint={`${summary.completedClasses} of ${plural(summary.totalClasses, 'class', 'classes')} completed`} />
        <Stat label="Weeks completed" value={`${summary.weeksCompleted} / ${summary.totalWeeks}`} hint={`${plural(summary.weeksStarted, 'week')} started`} />
        <Stat label="Days attended" value={attendance.length} hint={attendance[0] ? `Last on ${formatDay(attendance[0].day)}` : 'No activity yet'} />
        <Stat label="Video plays" value={summary.videoPlays} hint={summary.classesWatched ? `Across ${plural(summary.classesWatched, 'class', 'classes')}` : 'None yet'} />
      </div>

      <div className="adm-profile-grid">
        <div className="adm-profile-main">
          <section className="adm-card adm-profile-section">
            <header className="adm-profile-section-head">
              <h2>Progress by week</h2>
              <span className="adm-muted adm-small">Published classes only</span>
            </header>
            {weeks.length === 0 && <p className="adm-muted adm-profile-empty">No classes have been published for this group yet.</p>}
            {weeks.map((week) => {
              const done = week.classes.filter((c) => c.completedAt).length;
              return (
                <div key={week.weekNumber} className="adm-profile-week">
                  <div className="adm-profile-week-head">
                    <strong>Week {week.weekNumber}{week.title && <span className="adm-muted"> · {week.title}</span>}</strong>
                    <span className={`adm-badge ${done === week.classes.length ? 'adm-badge-completed' : done > 0 ? 'adm-badge-active' : 'adm-badge-draft'}`}>
                      {done} / {week.classes.length} done
                    </span>
                  </div>
                  <ul className="adm-profile-classes">
                    {week.classes.map((cls) => {
                      const state = classState(cls, week.released);
                      return (
                        <li key={cls.id} className={`is-${state.key}`}>
                          <state.Icon size={16} aria-hidden="true" />
                          <span className="adm-profile-class-title">{cls.title}</span>
                          <span className="adm-muted adm-small adm-profile-class-state">{state.label}</span>
                          <span className="adm-muted adm-small adm-nowrap adm-profile-class-plays">
                            {cls.plays > 0 ? `${plural(cls.plays, 'play')} · last ${dateTimeFormat.format(new Date(cls.lastWatchedAt))}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>

          <section className="adm-card adm-profile-section">
            <header className="adm-profile-section-head">
              <h2><CalendarCheck size={17} /> Attendance</h2>
              <span className="adm-muted adm-small">Days with at least one video watched or class completed (India time)</span>
            </header>
            {attendance.length === 0 ? (
              <p className="adm-muted adm-profile-empty">No attendance recorded yet.</p>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr><th>Day</th><th>Videos watched</th><th>Classes completed</th><th>Active between</th></tr>
                  </thead>
                  <tbody>
                    {attendance.map((d) => (
                      <tr key={d.day}>
                        <td className="adm-nowrap adm-strong">{formatDay(d.day)}</td>
                        <td>{d.videoPlays}</td>
                        <td>{d.classesCompleted}</td>
                        <td className="adm-nowrap adm-muted">{timeFormat.format(new Date(d.firstAt))} – {timeFormat.format(new Date(d.lastAt))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="adm-card adm-profile-section">
            <header className="adm-profile-section-head">
              <h2><Clock size={17} /> Recent activity</h2>
              <span className="adm-muted adm-small">Latest 30 events</span>
            </header>
            {recentActivity.length === 0 ? (
              <p className="adm-muted adm-profile-empty">Nothing yet.</p>
            ) : (
              <ul className="adm-activity">
                {recentActivity.map((a, i) => (
                  <li key={`${a.at}-${i}`}>
                    <span className={`adm-activity-kind is-${a.kind}`}>{ACTIVITY_LABELS[a.kind] || a.kind}</span>
                    <span>
                      {a.classTitle || 'A class that was removed'}
                      {a.videoTitle && <span className="adm-muted"> · {a.videoTitle}</span>}
                    </span>
                    <span className="adm-muted adm-small adm-nowrap">{dateTimeFormat.format(new Date(a.at))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="adm-card adm-profile-details adm-drawer-body">
          <RegistrationDetails registration={r} />
        </aside>
      </div>
    </div>
  );
}
