import React from 'react';
import Link from 'next/link';

// Header for the signed-out portal pages (sign in, interest form, activation).
// Pass `registerHref` to show the Register button.
export default function EverydayHeader({ registerHref }) {
  return (
    <header className="header">
      <Link className="brand" href="/student/login" aria-label="Everyday learner portal sign in">
        <span className="brand-mark" aria-hidden="true">E</span>
        <span>
          <strong>Everyday</strong>
          <small>Learner portal</small>
        </span>
      </Link>
      <nav className="header-actions" aria-label="Main Navigation">
        <Link className="nav-link" href="/student/login">Sign in</Link>
        {registerHref && <Link className="register-button" href={registerHref}>Register</Link>}
      </nav>
    </header>
  );
}
