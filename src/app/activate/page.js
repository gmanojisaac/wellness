'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../everyday.css';
import '../student/student.css';
import EverydayHeader from '../../components/everyday/EverydayHeader';
import EverydayFooter from '../../components/everyday/EverydayFooter';
import { MIN_PASSWORD_LENGTH } from '../../lib/registrationValidation';
import {
  activateAccount, getCurrentStudent, getDashboard, isPhoneCodeRequired, resendActivationLink, sendPhoneCode,
} from '../../lib/studentApi';

// Reached from the activation email (via /auth/confirm, which signs the learner in).
// Set password -> confirm mobile / WhatsApp -> accept terms -> account activated.
export default function ActivatePage() {
  const router = useRouter();
  const [view, setView] = useState('loading'); // loading | expired | form | done
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle'); // idle | sending | sent | not_required
  const [codeRequired, setCodeRequired] = useState(false);
  const [whatsAppOptIn, setWhatsAppOptIn] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getCurrentStudent();
      if (!user) {
        setView('expired');
        return;
      }
      setEmail(user.email);
      const [enrolments, required] = await Promise.all([
        getDashboard().catch(() => []),
        isPhoneCodeRequired().catch(() => false),
      ]);
      setCodeRequired(required);
      if (!required) setCodeState('not_required');
      if (!enrolments.some((e) => e.state === 'invited')) {
        router.replace('/student');
        return;
      }
      const withPhone = enrolments.find((e) => e.phone);
      if (withPhone) {
        setPhone(withPhone.phone);
        setWhatsAppOptIn(withPhone.whatsAppOptIn);
      }
      setView('form');
    })();
  }, [router]);

  const handleSendCode = async () => {
    setError('');
    setNotice('');
    setCodeState('sending');
    try {
      const result = await sendPhoneCode(phone);
      setCodeState(result.required ? 'sent' : 'not_required');
      if (result.required) setNotice('We sent a 6-digit code to this number on WhatsApp.');
    } catch (err) {
      setCodeState('idle');
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) return setError('The password and its confirmation do not match.');
    if (codeState === 'idle' || codeState === 'sending') return setError('Confirm your mobile / WhatsApp number first.');

    setBusy(true);
    try {
      const result = await activateAccount({ password, phone, code, whatsAppOptIn, acceptTerms });
      setPassword('');
      setConfirmPassword('');
      setPhoneVerified(result.phoneVerified);
      setView('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="everyday portal">
      <a className="skip" href="#main">Skip to content</a>
      <EverydayHeader />

      <main id="main" className="sp-narrow">
        {view === 'loading' && <p className="sp-muted sp-loading" role="status">Checking your activation link…</p>}
        {view === 'expired' && <ExpiredLink />}

        {view === 'done' && (
          <div className="sp-card sp-login" role="status">
            <span className="eyebrow">ACCOUNT ACTIVATED</span>
            <h1>Your learner account is ready.</h1>
            <p className="sp-muted">
              Password set{phoneVerified ? ' and phone confirmed' : ''}. Next, complete your enrolment.
            </p>
            <Link href="/student" className="register-button sp-block">Continue to Enrollment →</Link>
          </div>
        )}

        {view === 'form' && (
          <form className="sp-card sp-login" onSubmit={handleSubmit}>
            <span className="eyebrow">SET UP YOUR LEARNER ACCOUNT</span>
            <h1>Activate your account</h1>
            <p className="sp-muted sp-small">Create your own password, confirm your number and accept the program terms.</p>

            {error && <div className="sp-alert" role="alert">{error}</div>}
            {notice && !error && <div className="sp-note" role="status">{notice}</div>}

            <label className="sp-field">
              <span>Email address</span>
              <input type="email" value={email} readOnly />
            </label>
            <label className="sp-field">
              <span>Create password</span>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={MIN_PASSWORD_LENGTH} maxLength={72} autoComplete="new-password" autoFocus
              />
              <small className="sp-muted">At least {MIN_PASSWORD_LENGTH} characters.</small>
            </label>
            <label className="sp-field">
              <span>Confirm password</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
            </label>

            <div className="sp-field">
              <label htmlFor="act-phone">Mobile / WhatsApp number</label>
              <div className="sp-inline">
                <input
                  id="act-phone" type="tel" value={phone} placeholder="+91 98765 43210" required autoComplete="tel"
                  onChange={(e) => { setPhone(e.target.value); setCode(''); if (codeRequired) setCodeState('idle'); }}
                />
                {codeRequired && (
                  <button type="button" className="replay-button" onClick={handleSendCode} disabled={!phone || codeState === 'sending'}>
                    {codeState === 'sending' ? 'Sending…' : codeState === 'sent' ? 'Resend code' : 'Send code'}
                  </button>
                )}
              </div>
              <small className="sp-muted">
                Include the country code.{codeRequired ? ' We send a confirmation code on WhatsApp.' : ' Class updates and reminders are sent to your email.'}
              </small>
            </div>

            {codeState === 'sent' && (
              <label className="sp-field">
                <span>6-digit code</span>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoComplete="one-time-code"
                />
              </label>
            )}
            <label className="sp-check">
              <input type="checkbox" checked={whatsAppOptIn} onChange={(e) => setWhatsAppOptIn(e.target.checked)} />
              <span>
                {codeRequired
                  ? 'Send me class reminders on WhatsApp (a join link 2 minutes before each live class).'
                  : 'When WhatsApp reminders start, send them to this number too.'}
              </span>
            </label>
            <label className="sp-check">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} required />
              <span>
                I accept the program terms and the privacy &amp; safeguarding notice below.
                My data is stored securely and never shared with advertisers or other learners.
              </span>
            </label>
            <details className="sp-small sp-muted">
              <summary className="sp-link">Privacy &amp; safeguarding notice</summary>
              <ul>
                <li>Your email, phone and WhatsApp number are never shown to other learners.</li>
                <li>Class links are checked against your account and cohort, and stop working after class.</li>
                <li>Cohort discussions are visible only to your cohort and its facilitators.</li>
                <li>This is an educational program, not therapy or an emergency service. In India, call Tele-MANAS 14416 or 112 in a crisis.</li>
              </ul>
            </details>

            <button type="submit" className="register-button sp-block" disabled={busy}>
              {busy ? 'Activating…' : 'Activate my account'}
            </button>
          </form>
        )}
      </main>

      <EverydayFooter />
    </div>
  );
}

function ExpiredLink() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await resendActivationLink(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sp-card sp-login" onSubmit={handleSubmit}>
      <span className="eyebrow">ACTIVATION LINK</span>
      <h1>This link has expired</h1>
      <p className="sp-muted">
        Activation links work once and only for a short time. Enter your email and we will send a new one.
        Your details and selected program are saved.
      </p>
      {error && <div className="sp-alert" role="alert">{error}</div>}
      {sent ? (
        <div className="sp-note" role="status">If that email is registered, a new link is on its way. Check your inbox.</div>
      ) : (
        <>
          <label className="sp-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <button type="submit" className="register-button sp-block" disabled={busy}>
            {busy ? 'Sending…' : 'Send a new link'}
          </button>
        </>
      )}
      <p className="sp-muted sp-small">
        Already activated? <Link href="/student/login" className="sp-link">Sign in</Link>
      </p>
    </form>
  );
}
