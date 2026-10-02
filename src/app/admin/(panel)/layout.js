'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardList, Layers, Leaf, LoaderCircle, LogOut, Menu, Settings, X } from 'lucide-react';
import { AdminAuthError, getCurrentAdmin, loginRedirectUrl, signOut } from '../../../lib/adminApi';

const NAV_ITEMS = [
  { href: '/admin/registrations', label: 'Registrations', icon: ClipboardList },
  { href: '/admin/groups', label: 'Groups', icon: Layers },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminPanelLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState(null);
  const [error, setError] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    getCurrentAdmin()
      .then(async (user) => {
        if (user) return setAdmin({ email: user.email });
        await signOut();
        router.replace(loginRedirectUrl());
      })
      .catch((err) => {
        if (err instanceof AdminAuthError) router.replace(loginRedirectUrl());
        else setError(err.message);
      });
  }, [router]);

  const handleLogout = async () => {
    await signOut().catch(() => {});
    router.replace('/admin/login');
  };

  if (error) {
    return (
      <main className="adm-center-screen">
        <div className="adm-alert adm-alert-error">{error}</div>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="adm-center-screen">
        <LoaderCircle size={28} className="adm-spin adm-muted" aria-label="Loading" />
      </main>
    );
  }

  return (
    <div className="adm-shell">
      <aside className={`adm-sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="adm-sidebar-brand">
          <span className="adm-brand-mark"><Leaf size={18} /></span>
          <div>
            <strong>EMW Admin</strong>
            <small>Everyday Mental Wellness</small>
          </div>
          <button className="adm-icon-btn adm-sidebar-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="adm-nav">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setNavOpen(false)} className={`adm-nav-link ${pathname.startsWith(href) ? 'is-active' : ''}`}>
              <Icon size={17} /> {label}
            </Link>
          ))}
        </nav>
      </aside>
      {navOpen && <div className="adm-backdrop" onClick={() => setNavOpen(false)} />}

      <div className="adm-main">
        <header className="adm-topbar">
          <button className="adm-icon-btn adm-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="adm-topbar-spacer" />
          <span className="adm-user-chip">
            <span className="adm-avatar">{admin.email.charAt(0).toUpperCase()}</span>
            {admin.email}
          </span>
          <button className="adm-btn adm-btn-ghost" onClick={handleLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </header>
        <main className="adm-content">{children}</main>
      </div>
    </div>
  );
}
