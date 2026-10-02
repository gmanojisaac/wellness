'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, BookOpen, Inbox, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import FormDrawer from '../../../../components/admin/FormDrawer';
import { AdminAuthError, loginRedirectUrl } from '../../../../lib/adminApi';
import { createGroup, deleteGroup, listGroups, swapGroups, updateGroup } from '../../../../lib/adminContent';
import { GROUP_STATUSES } from '../../../../lib/groups';
import { plural } from '../../../../lib/plural';

const NEW_GROUP = {
  name: '', title: '', audience: '', focus: '', eligibilityNotice: '',
  durationWeeks: 4, cadence: '', roomCapacity: 6, status: 'draft',
};

function GroupDrawer({ group, sortOrder, onClose, onSaved }) {
  const isNew = !group.id;
  const [fields, setFields] = useState(group);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasRegistrations = group.registrationCount > 0;

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    setBusy(true);
    setError('');
    try {
      if (isNew) await createGroup(fields, sortOrder);
      else await updateGroup(group.id, fields);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <FormDrawer
      title={isNew ? 'New group' : group.name}
      subtitle={isNew ? 'Create a classroom' : 'Edit group'}
      submitLabel={isNew ? 'Create group' : 'Save changes'}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <label className="adm-field">
        <span>Name</span>
        <input className="adm-input" value={fields.name} onChange={set('name')} required minLength={2} maxLength={80} placeholder="e.g. Parents & Caregivers" autoFocus />
      </label>
      <label className="adm-field">
        <span>Programme title</span>
        <input className="adm-input" value={fields.title} onChange={set('title')} maxLength={160} placeholder="The longer curriculum title" />
      </label>
      <label className="adm-field">
        <span>Audience</span>
        <input className="adm-input" value={fields.audience} onChange={set('audience')} maxLength={160} placeholder="Who this group is for" />
      </label>
      <label className="adm-field">
        <span>Short description</span>
        <textarea className="adm-input adm-textarea" value={fields.focus} onChange={set('focus')} maxLength={600} rows={3} />
      </label>
      <label className="adm-field">
        <span>Eligibility note</span>
        <input className="adm-input" value={fields.eligibilityNotice} onChange={set('eligibilityNotice')} maxLength={300} />
      </label>
      <div className="adm-field-row">
        <label className="adm-field">
          <span>Duration (weeks)</span>
          <input className="adm-input" type="number" value={fields.durationWeeks} onChange={set('durationWeeks')} required min={1} max={104} />
        </label>
        <label className="adm-field">
          <span>Room capacity</span>
          <input className="adm-input" type="number" value={fields.roomCapacity} onChange={set('roomCapacity')} required min={1} max={100} disabled={hasRegistrations} />
        </label>
      </div>
      {hasRegistrations && (
        <p className="adm-muted adm-small adm-field-hint">Room capacity is locked because people have already registered for this group.</p>
      )}
      <label className="adm-field">
        <span>Schedule note</span>
        <input className="adm-input" value={fields.cadence} onChange={set('cadence')} maxLength={160} placeholder="e.g. 1 weekend lesson per week" />
      </label>
      <label className="adm-field">
        <span>Status</span>
        <select className="adm-input" value={fields.status} onChange={set('status')}>
          {Object.entries(GROUP_STATUSES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <p className="adm-muted adm-small adm-field-hint">Only groups that are open for registration appear on the public registration form.</p>
    </FormDrawer>
  );
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const handleError = useCallback((err) => {
    if (err instanceof AdminAuthError) router.replace(loginRedirectUrl());
    else setError(err.message);
  }, [router]);

  const reload = useCallback(() => listGroups().then((rows) => {
    setGroups(rows);
    setError('');
  }).catch(handleError), [handleError]);

  useEffect(() => { reload(); }, [reload]);

  // Runs a row action, then refreshes the list.
  const run = async (id, action) => {
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      handleError(err);
    }
    await reload();
    setBusyId(null);
  };

  const confirmDelete = () => {
    const group = deleting;
    setDeleting(null);
    run(group.id, () => deleteGroup(group.id));
  };

  const nextSortOrder = groups?.length ? Math.max(...groups.map((g) => g.sortOrder)) + 1 : 1;

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1>Groups</h1>
          <p className="adm-muted">Classrooms that learners register for. Open a group to manage its weekly classes and videos.</p>
        </div>
        <div className="adm-page-actions">
          <button className="adm-btn adm-btn-primary" onClick={() => setEditing(NEW_GROUP)}>
            <Plus size={15} /> New group
          </button>
        </div>
      </div>

      <div className="adm-card">
        {error && <div className="adm-alert adm-alert-error adm-card-alert" role="alert">{error}</div>}
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Group</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Students</th>
                <th>Content</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody className={busyId ? 'is-loading' : ''}>
              {!groups && (
                <tr><td colSpan={7} className="adm-table-empty"><LoaderCircle size={22} className="adm-spin adm-muted" /></td></tr>
              )}
              {groups?.length === 0 && (
                <tr>
                  <td colSpan={7} className="adm-table-empty">
                    <Inbox size={28} className="adm-muted" />
                    <p>No groups yet. Create the first one.</p>
                  </td>
                </tr>
              )}
              {groups?.map((g, i) => (
                <tr key={g.id}>
                  <td className="adm-nowrap">
                    <button className="adm-icon-btn" disabled={i === 0 || busyId} onClick={() => run(g.id, () => swapGroups(g, groups[i - 1]))} aria-label={`Move ${g.name} up`}>
                      <ArrowUp size={15} />
                    </button>
                    <button className="adm-icon-btn" disabled={i === groups.length - 1 || busyId} onClick={() => run(g.id, () => swapGroups(g, groups[i + 1]))} aria-label={`Move ${g.name} down`}>
                      <ArrowDown size={15} />
                    </button>
                  </td>
                  <td className="adm-col-main">
                    <Link href={`/admin/groups/${g.id}`} className="adm-strong adm-link">{g.name}</Link>
                    {g.title && <div className="adm-muted adm-small">{g.title}</div>}
                  </td>
                  <td><span className={`adm-badge adm-badge-${g.status}`}>{GROUP_STATUSES[g.status]}</span></td>
                  <td className="adm-nowrap">
                    {g.durationWeeks} weeks
                    <div className="adm-muted adm-small">Rooms of {g.roomCapacity}</div>
                  </td>
                  <td>
                    {g.registrationCount > 0
                      ? <Link href={`/admin/groups/${g.id}?tab=students`} className="adm-link">{g.registrationCount}</Link>
                      : <span className="adm-muted">0</span>}
                  </td>
                  <td className="adm-nowrap">
                    {g.weekCount} of {g.durationWeeks} weeks
                    <div className="adm-muted adm-small">{plural(g.classCount, 'class', 'classes')}</div>
                  </td>
                  <td className="adm-nowrap adm-row-actions">
                    <Link href={`/admin/groups/${g.id}`} className="adm-btn adm-btn-ghost adm-btn-sm">
                      <BookOpen size={14} /> Classes
                    </Link>
                    <button className="adm-icon-btn" onClick={() => setEditing(g)} aria-label={`Edit ${g.name}`}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="adm-icon-btn adm-icon-btn-danger"
                      onClick={() => setDeleting(g)}
                      disabled={g.registrationCount > 0 || busyId}
                      title={g.registrationCount > 0 ? 'A group with registrations cannot be deleted. Close or archive it instead.' : 'Delete group'}
                      aria-label={`Delete ${g.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message={`${deleting.weekCount > 0 ? `Its ${plural(deleting.weekCount, 'week')} and ${plural(deleting.classCount, 'class', 'classes')}, with their videos, will be removed too. ` : ''}This cannot be undone.`}
          confirmLabel="Delete group"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {editing && (
        <GroupDrawer
          group={editing}
          sortOrder={nextSortOrder}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
