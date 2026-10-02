'use client';
import React, { useEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';

// In-page confirmation for destructive actions (native confirm() is blocked in embedded browsers).
export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <>
      <div className="adm-backdrop adm-backdrop-drawer" onClick={onCancel} />
      <div className="adm-modal adm-confirm" role="alertdialog" aria-modal="true" aria-labelledby="adm-confirm-title" aria-describedby="adm-confirm-message">
        <div className="adm-confirm-body">
          <span className="adm-confirm-icon"><TriangleAlert size={20} /></span>
          <div>
            <h2 id="adm-confirm-title">{title}</h2>
            <p id="adm-confirm-message" className="adm-muted">{message}</p>
          </div>
        </div>
        <footer className="adm-drawer-footer">
          <button ref={cancelRef} type="button" className="adm-btn adm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="adm-btn adm-btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </div>
    </>
  );
}
