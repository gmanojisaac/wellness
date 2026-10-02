'use client';
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Leaf, LoaderCircle, Lock, Mail } from 'lucide-react';
import { getCurrentAdmin, getSupabase, signOut } from '../../../lib/adminApi';

// Only allow redirects back into the admin area
function safeNext(value) {
  return value && value.startsWith('/admin') && !value.startsWith('//') ? value : '/admin/registrations';
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        throw new Error(signInError.status === 400 ? 'Invalid email or password.' : signInError.message);
      }

      if (!(await getCurrentAdmin())) {
        await signOut();
        throw new Error('This account does not have admin access.');
      }

      router.replace(safeNext(searchParams.get('next')));
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <form className="adm-login-card" onSubmit={handleSubmit} noValidate>
      <div className="adm-login-brand">
        <span className="adm-brand-mark"><Leaf size={20} /></span>
        <div>
          <h1>Admin Panel</h1>
          <p>Everyday Mental Wellness</p>
        </div>
      </div>

      {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}

      <label className="adm-field">
        <span>Email</span>
        <div className="adm-input-icon">
          <Mail size={16} />
          <input
            className="adm-input"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </label>

      <label className="adm-field">
        <span>Password</span>
        <div className="adm-input-icon">
          <Lock size={16} />
          <input
            className="adm-input"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="adm-input-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>

      <button type="submit" className="adm-btn adm-btn-primary adm-btn-block" disabled={submitting || !email || !password}>
        {submitting ? <><LoaderCircle size={16} className="adm-spin" /> Signing in…</> : 'Sign in'}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="adm-login-page">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
