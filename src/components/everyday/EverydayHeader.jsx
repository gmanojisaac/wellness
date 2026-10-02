import React from 'react';
import Link from 'next/link';

// Header for the Everyday-themed inner pages. Pass `registerHref` to show the Register button.
export default function EverydayHeader({ registerHref }) {
  return (
    <header className="header">
      <Link className="brand" href="/" aria-label="Everyday adult mental-wellness learning program home">
        <span className="brand-mark" aria-hidden="true">E</span>
        <span>
          <strong>Everyday</strong>
          <small>Adult mental-wellness learning program</small>
        </span>
      </Link>
      <nav className="header-actions" aria-label="Main Navigation">
        <Link className="nav-link" href="/#programs">Our programs</Link>
        <Link className="nav-link" href="/student">Student login</Link>
        {registerHref && <Link className="register-button" href={registerHref}>Register</Link>}
      </nav>
    </header>
  );
}
