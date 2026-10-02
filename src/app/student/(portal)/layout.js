'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../../everyday.css';
import '../student.css';
import EverydayFooter from '../../../components/everyday/EverydayFooter';
import { getCurrentStudent, signOut } from '../../../lib/studentApi';

export default function StudentPortalLayout({ children }) {
  const router = useRouter();
  const [student, setStudent] = useState(null);

  useEffect(() => {
    getCurrentStudent().then((user) => {
      if (user) return setStudent({ email: user.email });
      const next = window.location.pathname + window.location.search;
      router.replace(`/student/login?next=${encodeURIComponent(next)}`);
    });
  }, [router]);

  const handleSignOut = async () => {
    await signOut().catch(() => {});
    router.replace('/student/login');
  };

  return (
    <div className="everyday portal">
      <a className="skip" href="#main">Skip to content</a>
      <header className="header">
        <Link className="brand" href="/student" aria-label="Student portal home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>
            <strong>Everyday</strong>
            <small>Student portal</small>
          </span>
        </Link>
        {student && (
          <nav className="header-actions" aria-label="Student navigation">
            <Link className="nav-link" href="/student">My classes</Link>
            <span className="sp-user" title={student.email}>{student.email}</span>
            <button type="button" className="replay-button sp-signout" onClick={handleSignOut}>Sign out</button>
          </nav>
        )}
      </header>

      <main id="main">
        {student ? children : <p className="sp-muted sp-loading" role="status">Loading…</p>}
      </main>

      <EverydayFooter />
    </div>
  );
}
