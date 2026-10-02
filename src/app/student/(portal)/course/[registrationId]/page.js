'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { StudentAuthError, getCourse, getVideoUrl, setClassCompleted } from '../../../../../lib/studentApi';
import { plural } from '../../../../../lib/plural';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Turns a YouTube or Vimeo page link into its embeddable player URL; null for anything else.
function embedUrl(url) {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${pathname.slice(1)}`;
    if (host === 'youtube.com' && searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${searchParams.get('v')}`;
    if (host === 'vimeo.com' && /^\/\d+/.test(pathname)) return `https://player.vimeo.com/video/${pathname.split('/')[1]}`;
  } catch {
    // Not a URL we recognise
  }
  return null;
}

function VideoPlayer({ video }) {
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getVideoUrl(video.id)
      .then((data) => !cancelled && setSource(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [video.id]);

  if (error) return <div className="sp-alert" role="alert">{error}</div>;
  if (!source) return <p className="sp-muted sp-player-loading" role="status">Loading video…</p>;

  const embed = source.sourceType === 'link' ? embedUrl(source.url) : null;
  const isFile = source.sourceType === 'upload' || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(source.url);

  if (embed) {
    return (
      <div className="sp-player">
        <iframe src={embed} title={video.title} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      </div>
    );
  }
  if (isFile) {
    return (
      <div className="sp-player">
        <video src={source.url} controls playsInline autoPlay controlsList="nodownload" aria-label={video.title} />
      </div>
    );
  }
  return (
    <p className="sp-external">
      This video opens on another site.{' '}
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="sp-link">Open &ldquo;{video.title}&rdquo;</a>
    </p>
  );
}

export default function StudentCoursePage() {
  const { registrationId } = useParams();
  const router = useRouter();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [busyClassId, setBusyClassId] = useState(null);

  const handleError = useCallback((err) => {
    if (err instanceof StudentAuthError) router.replace('/student/login');
    else setError(err.message);
  }, [router]);

  const reload = useCallback(() => getCourse(registrationId).then((data) => {
    setCourse(data);
    setError('');
  }).catch(handleError), [registrationId, handleError]);

  useEffect(() => { reload(); }, [reload]);

  const toggleCompleted = async (cls) => {
    setBusyClassId(cls.id);
    try {
      await setClassCompleted(registrationId, cls.id, !cls.completed);
    } catch (err) {
      handleError(err);
    }
    await reload();
    setBusyClassId(null);
  };

  if (!course) {
    return (
      <>
        <Link href="/student" className="back-link">Back to my classes</Link>
        {error
          ? <div className="sp-alert sp-top-gap" role="alert">{error}</div>
          : <p className="sp-muted sp-loading" role="status">Loading your course…</p>}
      </>
    );
  }

  const { group, registration, weeks } = course;
  const openClasses = weeks.flatMap((w) => w.classes);
  const totalClasses = weeks.reduce((sum, w) => sum + w.classCount, 0);
  const completedClasses = openClasses.filter((c) => c.completed).length;
  const percent = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
  const courseCompleted = registration.status === 'completed';

  return (
    <>
      <Link href="/student" className="back-link">Back to my classes</Link>

      <div className="sp-page-head">
        <span className="eyebrow">{plural(group.durationWeeks, 'week')}{group.cadence && ` · ${group.cadence}`}</span>
        <h1>{group.name}</h1>
        {group.title && <p className="sp-muted">{group.title}</p>}
      </div>

      {error && <div className="sp-alert" role="alert">{error}</div>}

      {courseCompleted && (
        <div className="sp-card sp-completed-banner" role="status">
          <h2>Course completed</h2>
          <p>You have finished every class in this course. You can still come back and watch any class again.</p>
        </div>
      )}

      <section className="sp-card sp-summary" aria-label="Your progress and session">
        <div>
          <div className="sp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Course progress">
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="sp-small sp-muted">
            {totalClasses > 0 ? `${completedClasses} of ${plural(totalClasses, 'class', 'classes')} completed` : 'No classes have been published yet.'}
          </p>
        </div>
        <dl className="sp-facts">
          <div><dt>Your session</dt><dd>{registration.timeSlotLabel}</dd></div>
          <div><dt>Your room</dt><dd>{registration.cohortCode} · Seat {registration.seatNumber} of {group.roomCapacity}</dd></div>
          <div><dt>Registration</dt><dd>{registration.registrationNumber}</dd></div>
        </dl>
      </section>

      {weeks.length === 0 && (
        <div className="sp-card sp-empty">
          <h2>Classes are on their way</h2>
          <p className="sp-muted">Nothing has been published for this group yet. Check back before your first session.</p>
        </div>
      )}

      {weeks.map((week) => (
        <section key={week.id} className={`sp-card sp-week ${week.released ? '' : 'is-locked'}`} aria-labelledby={`week-${week.id}`}>
          <header className="sp-week-head">
            <h2 id={`week-${week.id}`}>Week {week.number}{week.title && <span> · {week.title}</span>}</h2>
            <span className="sp-muted sp-small">
              {week.released
                ? `${week.classes.filter((c) => c.completed).length} of ${plural(week.classCount, 'class', 'classes')} done`
                : `Opens ${dateFormat.format(new Date(`${week.releaseDate}T00:00:00`))}`}
            </span>
          </header>

          {!week.released && (
            <p className="sp-muted sp-locked">
              {plural(week.classCount, 'class', 'classes')} will open on {dateFormat.format(new Date(`${week.releaseDate}T00:00:00`))}.
            </p>
          )}

          {week.classes.map((cls) => (
            <article key={cls.id} className={`sp-class ${cls.completed ? 'is-done' : ''}`}>
              <div className="sp-class-head">
                <div>
                  <h3>{cls.title}</h3>
                  {cls.description && <p className="sp-muted sp-class-desc">{cls.description}</p>}
                </div>
                <button
                  type="button"
                  className={cls.completed ? 'sp-done-button is-done' : 'sp-done-button'}
                  aria-pressed={cls.completed}
                  disabled={busyClassId === cls.id}
                  onClick={() => toggleCompleted(cls)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                  {cls.completed ? 'Completed' : 'Mark as completed'}
                </button>
              </div>

              {cls.videos.length === 0 && <p className="sp-muted sp-small">This class has no videos yet.</p>}
              <ul className="sp-videos">
                {cls.videos.map((video) => {
                  const isPlaying = playing?.id === video.id;
                  return (
                    <li key={video.id}>
                      <button type="button" className="sp-video-button" aria-expanded={isPlaying} onClick={() => setPlaying(isPlaying ? null : video)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">{isPlaying ? <path d="M8 5v14M16 5v14" /> : <path d="m7 4 13 8-13 8Z" />}</svg>
                        <span>{video.title}</span>
                        {video.durationSeconds !== null && <small>{formatDuration(video.durationSeconds)}</small>}
                      </button>
                      {isPlaying && <VideoPlayer video={video} />}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
