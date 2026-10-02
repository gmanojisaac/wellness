'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowDown, ArrowLeft, ArrowUp, BookOpen, CalendarDays, Eye, EyeOff, Film, Link2, LoaderCircle,
  Pencil, Play, Plus, Trash2, Upload, Users, X,
} from 'lucide-react';
import ConfirmDialog from '../../../../../components/admin/ConfirmDialog';
import FormDrawer from '../../../../../components/admin/FormDrawer';
import GroupStudents from '../../../../../components/admin/GroupStudents';
import { AdminAuthError, loginRedirectUrl } from '../../../../../lib/adminApi';
import {
  addWeeks, createClass, createVideo, deleteClass, deleteVideo, deleteWeek, loadCurriculum, renameVideo,
  setClassStatus, swapClasses, swapVideos, updateClass, updateWeek, videoPlaybackUrl,
} from '../../../../../lib/adminContent';
import { GROUP_STATUSES } from '../../../../../lib/groups';
import { plural } from '../../../../../lib/plural';

const MAX_WEEKS = 104;
const dateFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const nextSortOrder = (rows) => (rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1);

// Reads a video file's length from its metadata; resolves null if the browser cannot tell.
function readVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? Math.round(probe.duration) : null);
    probe.onerror = () => done(null);
    probe.src = url;
  });
}

// Shared busy/error handling for the drawers below.
function useSubmit(action, onSaved) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function WeekDrawer({ week, onClose, onSaved }) {
  const [title, setTitle] = useState(week.title);
  const [releaseDate, setReleaseDate] = useState(week.release_date || '');
  const { busy, error, submit } = useSubmit(() => updateWeek(week.id, { title, releaseDate }), onSaved);

  return (
    <FormDrawer title={`Week ${week.week_number}`} subtitle="Edit week" busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <label className="adm-field">
        <span>Title</span>
        <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Optional, e.g. Understanding stress" autoFocus />
      </label>
      <label className="adm-field">
        <span>Release date</span>
        <input className="adm-input" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
      </label>
      <p className="adm-muted adm-small adm-field-hint">Leave the date empty to make this week available as soon as its classes are published.</p>
    </FormDrawer>
  );
}

function ClassDrawer({ week, cls, onClose, onSaved }) {
  const [title, setTitle] = useState(cls?.title || '');
  const [description, setDescription] = useState(cls?.description || '');
  const { busy, error, submit } = useSubmit(
    () => (cls ? updateClass(cls.id, { title, description }) : createClass(week.id, { title, description }, nextSortOrder(week.classes))),
    onSaved
  );

  return (
    <FormDrawer
      title={cls ? cls.title : 'New class'}
      subtitle={`Week ${week.week_number}`}
      submitLabel={cls ? 'Save changes' : 'Add class'}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <label className="adm-field">
        <span>Title</span>
        <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} autoFocus />
      </label>
      <label className="adm-field">
        <span>Description</span>
        <textarea className="adm-input adm-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={5} />
      </label>
      {!cls && <p className="adm-muted adm-small adm-field-hint">New classes start as drafts. Publish a class once its videos are in place.</p>}
    </FormDrawer>
  );
}

function VideoDrawer({ groupId, cls, video, onClose, onSaved }) {
  const [title, setTitle] = useState(video?.title || '');
  const [sourceType, setSourceType] = useState('upload');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');

  const { busy, error, submit } = useSubmit(async () => {
    if (video) return renameVideo(video.id, title);
    if (sourceType === 'upload' && !file) throw new Error('Choose a video file to upload.');
    return createVideo({
      groupId,
      classId: cls.id,
      title,
      source: sourceType === 'upload' ? { file } : { url },
      durationSeconds: sourceType === 'upload' ? await readVideoDuration(file) : null,
      sortOrder: nextSortOrder(cls.videos),
    });
  }, onSaved);

  const handleFile = (e) => {
    const picked = e.target.files[0] || null;
    setFile(picked);
    if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
  };

  return (
    <FormDrawer
      title={video ? video.title : 'Add video'}
      subtitle={cls.title}
      submitLabel={video ? 'Save changes' : busy && sourceType === 'upload' ? 'Uploading…' : 'Add video'}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      {!video && (
        <>
          <div className="adm-field">
            <span>Source</span>
            <div className="adm-segmented" role="radiogroup" aria-label="Video source">
              <button type="button" role="radio" aria-checked={sourceType === 'upload'} className={sourceType === 'upload' ? 'is-active' : ''} onClick={() => setSourceType('upload')}>
                <Upload size={14} /> Upload a file
              </button>
              <button type="button" role="radio" aria-checked={sourceType === 'link'} className={sourceType === 'link' ? 'is-active' : ''} onClick={() => setSourceType('link')}>
                <Link2 size={14} /> Use a link
              </button>
            </div>
          </div>
          {/* Distinct keys: a file input cannot turn into a controlled text input */}
          {sourceType === 'upload' ? (
            <label key="upload" className="adm-field">
              <span>Video file</span>
              <input className="adm-input adm-input-file" type="file" accept="video/*" onChange={handleFile} />
              {file && <small className="adm-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</small>}
            </label>
          ) : (
            <label key="link" className="adm-field">
              <span>Video link</span>
              <input className="adm-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required pattern="https://.*" maxLength={2000} placeholder="https://" />
            </label>
          )}
        </>
      )}
      <label className="adm-field">
        <span>Title</span>
        <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} autoFocus={Boolean(video)} />
      </label>
      {!video && sourceType === 'upload' && (
        <p className="adm-muted adm-small adm-field-hint">Keep this window open until the upload finishes. Uploaded videos are private and only playable through the site.</p>
      )}
    </FormDrawer>
  );
}

function VideoPreview({ video, onClose }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    videoPlaybackUrl(video).then(setUrl).catch((err) => setError(err.message));
  }, [video]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="adm-backdrop adm-backdrop-drawer" onClick={onClose} />
      <div className="adm-modal" role="dialog" aria-modal="true" aria-label={`Preview: ${video.title}`}>
        <header className="adm-drawer-header">
          <h2>{video.title}</h2>
          <button className="adm-icon-btn" onClick={onClose} aria-label="Close preview"><X size={18} /></button>
        </header>
        <div className="adm-modal-body">
          {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}
          {!url && !error && <LoaderCircle size={22} className="adm-spin adm-muted" />}
          {url && video.source_type === 'upload' && <video src={url} controls autoPlay playsInline />}
          {url && video.source_type === 'link' && (
            <p>
              This video is hosted elsewhere: <a href={url} target="_blank" rel="noopener noreferrer" className="adm-link">{url}</a>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default function GroupCurriculumPage() {
  const { groupId } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [dialog, setDialog] = useState(null);
  // The Groups list links here with ?tab=students
  const [view, setView] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'students' ? 'students' : 'classes'
  ));

  const handleError = useCallback((err) => {
    if (err instanceof AdminAuthError) router.replace(loginRedirectUrl());
    else setError(err.message);
  }, [router]);

  const reload = useCallback(() => loadCurriculum(groupId).then((result) => {
    setData(result);
    setError('');
  }).catch(handleError), [groupId, handleError]);

  useEffect(() => { reload(); }, [reload]);

  // Runs an action, then refreshes the curriculum.
  const run = async (action) => {
    setWorking(true);
    try {
      await action();
    } catch (err) {
      handleError(err);
    }
    await reload();
    setWorking(false);
  };

  const switchView = (next) => {
    setView(next);
    setError('');
  };

  const closeAndReload = () => {
    setDialog(null);
    reload();
  };

  if (!data) {
    return (
      <div className="adm-page">
        {error
          ? <div className="adm-alert adm-alert-error" role="alert">{error}</div>
          : <LoaderCircle size={24} className="adm-spin adm-muted" aria-label="Loading" />}
      </div>
    );
  }

  const { group, weeks } = data;
  if (!group) {
    return (
      <div className="adm-page">
        <Link href="/admin/groups" className="adm-back-link"><ArrowLeft size={15} /> All groups</Link>
        <div className="adm-alert adm-alert-error" role="alert">This group does not exist. It may have been deleted.</div>
      </div>
    );
  }

  const existing = new Set(weeks.map((w) => w.week_number));
  const missingWeeks = Array.from({ length: group.durationWeeks }, (_, i) => i + 1).filter((n) => !existing.has(n));
  const nextWeekNumber = (weeks.at(-1)?.week_number || 0) + 1;
  const classCount = weeks.reduce((sum, w) => sum + w.classes.length, 0);
  const publishedCount = weeks.reduce((sum, w) => sum + w.classes.filter((c) => c.status === 'published').length, 0);

  const confirmDelete = (title, message, action) => setDialog({ type: 'confirm', title, message, action });

  return (
    <div className="adm-page">
      <Link href="/admin/groups" className="adm-back-link"><ArrowLeft size={15} /> All groups</Link>

      <div className="adm-page-header">
        <div>
          <h1>{group.name}</h1>
          <p className="adm-muted">
            <span className={`adm-badge adm-badge-${group.status}`}>{GROUP_STATUSES[group.status]}</span>
            {' '}{plural(group.durationWeeks, 'week')} · {plural(classCount, 'class', 'classes')}, {publishedCount} published
          </p>
        </div>
        <div className="adm-page-actions" hidden={view !== 'classes'}>
          {missingWeeks.length > 0 && (
            <button className="adm-btn adm-btn-ghost" disabled={working} onClick={() => run(() => addWeeks(group.id, missingWeeks))}>
              <CalendarDays size={15} /> {weeks.length === 0 ? `Create all ${group.durationWeeks} weeks` : `Add ${plural(missingWeeks.length, 'missing week')}`}
            </button>
          )}
          <button className="adm-btn adm-btn-primary" disabled={working || nextWeekNumber > MAX_WEEKS} onClick={() => run(() => addWeeks(group.id, [nextWeekNumber]))}>
            <Plus size={15} /> Add week {nextWeekNumber}
          </button>
        </div>
      </div>

      <div className="adm-tabs" role="tablist" aria-label="Group sections">
        <button role="tab" aria-selected={view === 'classes'} className={view === 'classes' ? 'is-active' : ''} onClick={() => switchView('classes')}>
          <BookOpen size={15} /> Classes
        </button>
        <button role="tab" aria-selected={view === 'students'} className={view === 'students' ? 'is-active' : ''} onClick={() => switchView('students')}>
          <Users size={15} /> Students
        </button>
      </div>

      {error && <div className="adm-alert adm-alert-error adm-page-alert" role="alert">{error}</div>}

      {view === 'students' && <GroupStudents group={group} onError={handleError} />}

      {view === 'classes' && weeks.length === 0 && (
        <div className="adm-card adm-empty-card">
          <CalendarDays size={28} className="adm-muted" />
          <p>No weeks yet. Create the weeks, then add classes and videos to each one.</p>
        </div>
      )}

      <div className={`adm-weeks ${working ? 'is-loading' : ''}`} hidden={view !== 'classes'}>
        {weeks.map((week) => (
          <section key={week.id} className="adm-card adm-week">
            <header className="adm-week-header">
              <div>
                <h2>Week {week.week_number}{week.title && <span> · {week.title}</span>}</h2>
                <span className="adm-muted adm-small">
                  {week.release_date ? `Releases ${dateFormat.format(new Date(`${week.release_date}T00:00:00`))}` : 'No release date'}
                  {' · '}{plural(week.classes.length, 'class', 'classes')}
                </span>
              </div>
              <div className="adm-row-actions">
                <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setDialog({ type: 'class', week })}>
                  <Plus size={14} /> Add class
                </button>
                <button className="adm-icon-btn" onClick={() => setDialog({ type: 'week', week })} aria-label={`Edit week ${week.week_number}`}>
                  <Pencil size={15} />
                </button>
                <button
                  className="adm-icon-btn adm-icon-btn-danger"
                  onClick={() => confirmDelete(`Delete week ${week.week_number}?`, `${week.classes.length > 0 ? `Its ${plural(week.classes.length, 'class', 'classes')} and their videos will be removed too. ` : ''}This cannot be undone.`, () => deleteWeek(week))}
                  aria-label={`Delete week ${week.week_number}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </header>

            {week.classes.length === 0 && <p className="adm-muted adm-week-empty">No classes in this week yet.</p>}

            {week.classes.map((cls, ci) => {
              const published = cls.status === 'published';
              return (
                <article key={cls.id} className="adm-class">
                  <div className="adm-class-header">
                    <div className="adm-class-order">
                      <button className="adm-icon-btn" disabled={ci === 0 || working} onClick={() => run(() => swapClasses(cls, week.classes[ci - 1]))} aria-label={`Move ${cls.title} up`}>
                        <ArrowUp size={14} />
                      </button>
                      <button className="adm-icon-btn" disabled={ci === week.classes.length - 1 || working} onClick={() => run(() => swapClasses(cls, week.classes[ci + 1]))} aria-label={`Move ${cls.title} down`}>
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <div className="adm-class-title">
                      <strong>{cls.title}</strong>
                      <span className={`adm-badge adm-badge-${cls.status}`}>{cls.status}</span>
                      {cls.description && <p className="adm-muted adm-small">{cls.description}</p>}
                    </div>
                    <div className="adm-row-actions">
                      <button
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        disabled={working}
                        onClick={() => run(() => setClassStatus(cls.id, published ? 'draft' : 'published'))}
                        title={published ? 'Hide this class from learners' : 'Make this class visible to learners'}
                      >
                        {published ? <><EyeOff size={14} /> Unpublish</> : <><Eye size={14} /> Publish</>}
                      </button>
                      <button className="adm-icon-btn" onClick={() => setDialog({ type: 'class', week, cls })} aria-label={`Edit ${cls.title}`}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="adm-icon-btn adm-icon-btn-danger"
                        onClick={() => confirmDelete(`Delete "${cls.title}"?`, `${cls.videos.length > 0 ? `Its ${plural(cls.videos.length, 'video')} will be removed too. ` : ''}This cannot be undone.`, () => deleteClass(cls))}
                        aria-label={`Delete ${cls.title}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <ul className="adm-videos">
                    {cls.videos.map((video, vi) => (
                      <li key={video.id}>
                        <Film size={15} className="adm-muted" />
                        <span className="adm-video-title">{video.title}</span>
                        <span className="adm-muted adm-small adm-nowrap">
                          {video.source_type === 'upload' ? 'Uploaded' : 'Link'}
                          {video.duration_seconds !== null && ` · ${formatDuration(video.duration_seconds)}`}
                        </span>
                        <div className="adm-row-actions">
                          <button className="adm-icon-btn" onClick={() => setDialog({ type: 'preview', video })} aria-label={`Preview ${video.title}`}>
                            <Play size={14} />
                          </button>
                          <button className="adm-icon-btn" disabled={vi === 0 || working} onClick={() => run(() => swapVideos(video, cls.videos[vi - 1]))} aria-label={`Move ${video.title} up`}>
                            <ArrowUp size={14} />
                          </button>
                          <button className="adm-icon-btn" disabled={vi === cls.videos.length - 1 || working} onClick={() => run(() => swapVideos(video, cls.videos[vi + 1]))} aria-label={`Move ${video.title} down`}>
                            <ArrowDown size={14} />
                          </button>
                          <button className="adm-icon-btn" onClick={() => setDialog({ type: 'video', cls, video })} aria-label={`Rename ${video.title}`}>
                            <Pencil size={14} />
                          </button>
                          <button
                            className="adm-icon-btn adm-icon-btn-danger"
                            onClick={() => confirmDelete(`Delete "${video.title}"?`, 'The video will be removed from this class. This cannot be undone.', () => deleteVideo(video))}
                            aria-label={`Delete ${video.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                    <li className="adm-videos-add">
                      <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setDialog({ type: 'video', cls })}>
                        <Plus size={14} /> Add video
                      </button>
                    </li>
                  </ul>
                </article>
              );
            })}
          </section>
        ))}
      </div>

      {dialog?.type === 'week' && <WeekDrawer week={dialog.week} onClose={() => setDialog(null)} onSaved={closeAndReload} />}
      {dialog?.type === 'class' && <ClassDrawer week={dialog.week} cls={dialog.cls} onClose={() => setDialog(null)} onSaved={closeAndReload} />}
      {dialog?.type === 'video' && <VideoDrawer groupId={group.id} cls={dialog.cls} video={dialog.video} onClose={() => setDialog(null)} onSaved={closeAndReload} />}
      {dialog?.type === 'confirm' && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          onConfirm={() => { setDialog(null); run(dialog.action); }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'preview' && <VideoPreview video={dialog.video} onClose={() => setDialog(null)} />}
    </div>
  );
}
