'use client';
import React, { useEffect, useState } from 'react';
import { CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react';
import { getSupabase } from '../../../../lib/adminApi';

const MIN_PASSWORD_LENGTH = 10;

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);

    if (next.length < MIN_PASSWORD_LENGTH) return setError(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (next !== confirm) return setError('The new password and its confirmation do not match.');
    if (next === current) return setError('The new password must be different from the current one.');

    setBusy(true);
    try {
      const supabase = getSupabase();
      // Re-check the current password so an unattended, signed-in browser cannot change it.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInError) throw new Error('The current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw new Error(updateError.message || 'The password could not be changed.');

      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputType = show ? 'text' : 'password';

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1>Settings</h1>
          <p className="adm-muted">Manage your admin account.</p>
        </div>
      </div>

      <form className="adm-card adm-settings-card" onSubmit={handleSubmit}>
        <header className="adm-settings-header">
          <span className="adm-settings-icon"><KeyRound size={18} /></span>
          <div>
            <h2>Change password</h2>
            <p className="adm-muted adm-small">Signed in as {email || '…'}</p>
          </div>
        </header>

        {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}
        {saved && (
          <div className="adm-alert adm-alert-success" role="status">
            <CircleCheck size={16} /> Password changed. Use the new password the next time you sign in.
          </div>
        )}

        <label className="adm-field">
          <span>Current password</span>
          <input className="adm-input" type={inputType} value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </label>
        <label className="adm-field">
          <span>New password</span>
          <input className="adm-input" type={inputType} value={next} onChange={(e) => setNext(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
          <small className="adm-muted">At least {MIN_PASSWORD_LENGTH} characters.</small>
        </label>
        <label className="adm-field">
          <span>Confirm new password</span>
          <input className="adm-input" type={inputType} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </label>

        <div className="adm-settings-actions">
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />} {show ? 'Hide passwords' : 'Show passwords'}
          </button>
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !email}>
            {busy && <LoaderCircle size={15} className="adm-spin" />} Change password
          </button>
        </div>
      </form>
    </div>
  );
}
