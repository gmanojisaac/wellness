'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, Inbox, LoaderCircle, Pencil, Plus, Power, TicketPercent, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import FormDrawer from '../../../../components/admin/FormDrawer';
import { AdminAuthError, loginRedirectUrl } from '../../../../lib/adminApi';
import { listGroups } from '../../../../lib/adminContent';
import {
  PROMO_CODE_RE, createPromoCode, deletePromoCode, getPromoCheckout, listPromoCodes, listRedemptions,
  setPromoCheckout, setPromoCodeActive, updatePromoCode,
} from '../../../../lib/adminPromo';

const NEW_CODE = { code: '', description: '', groupId: '', maxUses: '100', expiresOn: '' };

const formatDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const toDateInput = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');

function codeStatus(c) {
  if (!c.active) return { label: 'Inactive', badge: 'archived' };
  if (c.expiresAt && new Date(c.expiresAt) <= new Date()) return { label: 'Expired', badge: 'closed' };
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return { label: 'Used up', badge: 'closed' };
  return { label: 'Active', badge: 'success' };
}

function CodeDrawer({ promo, groups, onClose, onSaved }) {
  const isNew = !promo.id;
  const [fields, setFields] = useState(promo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    if (isNew && !PROMO_CODE_RE.test(fields.code.trim().toUpperCase())) {
      return setError('Codes are 3–32 characters: letters, numbers, - and _.');
    }
    if (fields.maxUses !== '' && promo.usedCount > Number(fields.maxUses)) {
      return setError(`This code has already been used ${promo.usedCount} times, so the limit cannot be lower than that.`);
    }
    setBusy(true);
    try {
      if (isNew) await createPromoCode(fields);
      else await updatePromoCode(promo.id, fields);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <FormDrawer
      title={isNew ? 'New promo code' : promo.code}
      subtitle={isNew ? 'Learners enrol free with this code' : 'Edit promo code'}
      submitLabel={isNew ? 'Create code' : 'Save changes'}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <label className="adm-field">
        <span>Code</span>
        <input
          className="adm-input adm-mono"
          value={fields.code}
          onChange={(e) => setFields((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          required
          minLength={3}
          maxLength={32}
          disabled={!isNew}
          placeholder="e.g. EMWFIRST100"
          autoFocus={isNew}
        />
        <small className="adm-muted">{isNew ? 'Letters, numbers, - and _. Learners can type it in any case.' : 'The code itself cannot be changed. Create a new one instead.'}</small>
      </label>
      <label className="adm-field">
        <span>Note (only admins see this)</span>
        <input className="adm-input" value={fields.description} onChange={set('description')} maxLength={200} placeholder="e.g. First 100 learners, launch email" />
      </label>
      <label className="adm-field">
        <span>Valid for</span>
        <select className="adm-input" value={fields.groupId} onChange={set('groupId')}>
          <option value="">All groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <div className="adm-field-row">
        <label className="adm-field">
          <span>Maximum uses</span>
          <input className="adm-input" type="number" value={fields.maxUses} onChange={set('maxUses')} min={1} max={100000} placeholder="Unlimited" />
          <small className="adm-muted">Leave empty for unlimited.</small>
        </label>
        <label className="adm-field">
          <span>Expires after</span>
          <input className="adm-input" type="date" value={fields.expiresOn} onChange={set('expiresOn')} />
          <small className="adm-muted">Optional. Valid through the end of this day (IST).</small>
        </label>
      </div>
    </FormDrawer>
  );
}

function Redemptions({ promoCodeId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listRedemptions(promoCodeId).then(setRows).catch((err) => setError(err.message));
  }, [promoCodeId]);

  if (error) return <div className="adm-alert adm-alert-error">{error}</div>;
  if (!rows) return <LoaderCircle size={18} className="adm-spin adm-muted" />;
  if (rows.length === 0) return <p className="adm-muted adm-small">No one has used this code yet.</p>;
  return (
    <ul className="adm-redemptions">
      {rows.map((r) => (
        <li key={r.registrationId}>
          <Link href={`/admin/students/${r.registrationId}`} className="adm-link adm-strong">{r.fullName}</Link>
          <span className="adm-muted">{r.email}</span>
          <span className="adm-muted adm-mono">{r.registrationNumber}</span>
          <span className="adm-muted">{formatDate(r.redeemedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PromoCodesPage() {
  const router = useRouter();
  const [promoOn, setPromoOn] = useState(null);
  const [codes, setCodes] = useState(null);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const handleError = useCallback((err) => {
    if (err instanceof AdminAuthError) router.replace(loginRedirectUrl());
    else setError(err.message);
  }, [router]);

  const load = useCallback(() => {
    return Promise.all([getPromoCheckout(), listPromoCodes()])
      .then(([on, rows]) => { setPromoOn(on); setCodes(rows); })
      .catch(handleError);
  }, [handleError]);

  useEffect(() => {
    load();
    listGroups().then(setGroups).catch(handleError);
  }, [load, handleError]);

  const run = async (id, action) => {
    setError('');
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  };

  const confirmSwitch = () => {
    const enabled = switching;
    setSwitching(null);
    run('mode', () => setPromoCheckout(enabled));
  };

  const confirmDelete = () => {
    const { id } = deleting;
    setDeleting(null);
    run(id, () => deletePromoCode(id));
  };

  const activeCodes = codes?.filter((c) => codeStatus(c).badge === 'success').length ?? 0;

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1>Promo codes</h1>
          <p className="adm-muted">Let learners enrol free with a code while payments are switched off.</p>
        </div>
        <div className="adm-page-actions">
          <button className="adm-btn adm-btn-primary" onClick={() => setEditing({ ...NEW_CODE })}>
            <Plus size={16} /> New code
          </button>
        </div>
      </div>

      {error && <div className="adm-alert adm-alert-error adm-page-alert" role="alert">{error}</div>}

      <section className="adm-card adm-promo-mode">
        <div>
          <h2>How learners enrol</h2>
          <p className="adm-muted adm-small">
            {promoOn === null ? 'Loading…'
              : promoOn
                ? `Learners enter a promo code on the enrolment page. Razorpay payment is not offered. ${activeCodes === 0 ? 'There is no active code, so nobody can enrol right now.' : ''}`
                : 'Learners pay the group fee with Razorpay. Promo codes are not accepted.'}
          </p>
        </div>
        <div className="adm-segmented" role="radiogroup" aria-label="Enrolment method">
          <button type="button" role="radio" aria-checked={promoOn === true} className={promoOn === true ? 'is-active' : ''} disabled={promoOn === null || busyId === 'mode'} onClick={() => promoOn === false && setSwitching(true)}>
            <TicketPercent size={15} /> Promo code
          </button>
          <button type="button" role="radio" aria-checked={promoOn === false} className={promoOn === false ? 'is-active' : ''} disabled={promoOn === null || busyId === 'mode'} onClick={() => promoOn === true && setSwitching(false)}>
            <CreditCard size={15} /> Razorpay payment
          </button>
        </div>
      </section>

      <div className="adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Valid for</th>
                <th>Used</th>
                <th>Expires</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody className={busyId && busyId !== 'mode' ? 'is-loading' : ''}>
              {!codes && (
                <tr><td colSpan={6} className="adm-table-empty"><LoaderCircle size={22} className="adm-spin adm-muted" /></td></tr>
              )}
              {codes?.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-table-empty">
                    <Inbox size={28} className="adm-muted" />
                    <p>No promo codes yet. Create one to send in the invitation email.</p>
                  </td>
                </tr>
              )}
              {codes?.map((c) => {
                const status = codeStatus(c);
                return (
                  <React.Fragment key={c.id}>
                    <tr>
                      <td className="adm-col-main">
                        <span className="adm-strong adm-mono">{c.code}</span>
                        {c.description && <div className="adm-muted adm-small">{c.description}</div>}
                      </td>
                      <td>{c.groupName || <span className="adm-muted">All groups</span>}</td>
                      <td className="adm-nowrap">
                        <button type="button" className="adm-link" onClick={() => setExpanded(expanded === c.id ? null : c.id)} aria-expanded={expanded === c.id}>
                          {c.usedCount}{c.maxUses !== null ? ` of ${c.maxUses}` : ''}
                        </button>
                      </td>
                      <td className="adm-nowrap">{c.expiresAt ? formatDate(c.expiresAt) : <span className="adm-muted">Never</span>}</td>
                      <td><span className={`adm-badge adm-badge-${status.badge}`}>{status.label}</span></td>
                      <td className="adm-nowrap adm-row-actions">
                        <button className="adm-btn adm-btn-ghost adm-btn-sm" disabled={!!busyId} onClick={() => run(c.id, () => setPromoCodeActive(c.id, !c.active))}>
                          <Power size={14} /> {c.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="adm-icon-btn" onClick={() => setEditing({ ...c, maxUses: c.maxUses === null ? '' : String(c.maxUses), groupId: c.groupId || '', expiresOn: toDateInput(c.expiresAt) })} aria-label={`Edit ${c.code}`}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="adm-icon-btn adm-icon-btn-danger"
                          onClick={() => setDeleting(c)}
                          disabled={c.usedCount > 0 || !!busyId}
                          title={c.usedCount > 0 ? 'A used code cannot be deleted. Deactivate it instead.' : 'Delete code'}
                          aria-label={`Delete ${c.code}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr>
                        <td colSpan={6}><Redemptions promoCodeId={c.id} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <CodeDrawer
          promo={editing}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {switching !== null && (
        <ConfirmDialog
          title={switching ? 'Switch to promo codes?' : 'Switch to Razorpay payment?'}
          message={switching
            ? 'Learners who have not enrolled yet will need a valid promo code. They will not be able to pay.'
            : 'Learners who have not enrolled yet will be asked to pay the group fee. Promo codes will stop working. Make sure the Razorpay keys are set.'}
          confirmLabel={switching ? 'Use promo codes' : 'Use Razorpay payment'}
          onConfirm={confirmSwitch}
          onCancel={() => setSwitching(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.code}"?`}
          message="Learners will no longer be able to use this code. This cannot be undone."
          confirmLabel="Delete code"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
