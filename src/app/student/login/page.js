'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../../everyday.css';
import '../student.css';
import EverydayHeader from '../../../components/everyday/EverydayHeader';
import EverydayFooter from '../../../components/everyday/EverydayFooter';
import { getCurrentStudent, signIn } from '../../../lib/studentApi';

// Only allow redirects back into the student portal
function nextPath() {
  const value = new URLSearchParams(window.location.search).get('next');
  return value && value.startsWith('/student') && !value.startsWith('//') ? value : '/student';
}

export default function StudentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Already signed in: go straight to the portal
  useEffect(() => {
    getCurrentStudent().then((user) => { if (user) router.replace(nextPath()); });
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace(nextPath());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="everyday portal">
      <a className="skip" href="#main">Skip to content</a>
      <EverydayHeader registerHref="/register" />

      <main id="main" className="sp-narrow">
        <form className="sp-card sp-login" onSubmit={handleSubmit}>
          <span className="eyebrow">STUDENT PORTAL</span>
          <h1>Sign in to your classes</h1>
          <p className="sp-muted">Use your email and the password you created when you activated your account.</p>

          {error && <div className="sp-alert" role="alert">{error}</div>}

          <label className="sp-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          </label>
          <label className="sp-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>

          <button type="submit" className="register-button sp-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="sp-muted sp-small">
            Not registered yet? <Link href="/register" className="sp-link">Register for a group</Link>
          </p>
          <p className="sp-muted sp-small">
            Activation link expired? <Link href="/activate" className="sp-link">Get a new one</Link>
            {' · '}
            <Link href="/admin/login" className="sp-link">Admin sign in</Link>
          </p>
        </form>
      </main>

      <EverydayFooter />
    </div>
  );
}
