'use client';
import React, { useEffect } from 'react';
import { LoaderCircle, X } from 'lucide-react';

// Slide-in drawer wrapping a form, with Cancel/Save in the footer.
export default function FormDrawer({ title, subtitle, submitLabel = 'Save', busy, error, onClose, onSubmit, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <>
      <div className="adm-backdrop adm-backdrop-drawer" onClick={busy ? undefined : onClose} />
      <aside className="adm-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-form-drawer-title">
        <header className="adm-drawer-header">
          <div>
            {subtitle && <span className="adm-muted adm-small">{subtitle}</span>}
            <h2 id="adm-form-drawer-title">{title}</h2>
          </div>
          <button className="adm-icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </header>
        <form className="adm-drawer-form" onSubmit={handleSubmit}>
          <div className="adm-drawer-body adm-form-body">
            {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}
            {children}
          </div>
          <footer className="adm-drawer-footer">
            <button type="button" className="adm-btn adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
              {busy && <LoaderCircle size={15} className="adm-spin" />} {submitLabel}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}
