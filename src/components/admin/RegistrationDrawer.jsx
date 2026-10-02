'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { UserRound, X } from 'lucide-react';

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function formatDate(iso) {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}

function DetailRow({ label, children }) {
  return (
    <div className="adm-detail-row">
      <dt>{label}</dt>
      <dd>{children || <span className="adm-muted">—</span>}</dd>
    </div>
  );
}

// Everything a student entered on the registration form, plus their room and status.
export function RegistrationDetails({ registration: r }) {
  return (
    <>
      <section>
        <h3>Contact</h3>
        <dl>
          <DetailRow label="Email"><a href={`mailto:${r.email}`}>{r.email}</a></DetailRow>
          <DetailRow label="Phone">{r.phone}</DetailRow>
          <DetailRow label="WhatsApp reminders">{r.whatsAppOptIn ? 'Opted in' : 'Not opted in'}</DetailRow>
        </dl>
      </section>
      <section>
        <h3>Program</h3>
        <dl>
          <DetailRow label="Group">{r.groupName}</DetailRow>
          <DetailRow label="Track">{r.groupTitle}</DetailRow>
          <DetailRow label="Time slot">{r.timeSlotLabel}</DetailRow>
          <DetailRow label="Cohort">{r.cohortCode} · Seat {r.seatNumber} of {r.maxRoomCapacity}</DetailRow>
          <DetailRow label="Participation">{r.participationStyleLabel}</DetailRow>
        </dl>
      </section>
      <section>
        <h3>About them</h3>
        <dl>
          <DetailRow label="Primary goal">{r.primaryGoal}</DetailRow>
          <DetailRow label="Notes">{r.notes && <span className="adm-prewrap">{r.notes}</span>}</DetailRow>
        </dl>
      </section>
      <section>
        <h3>Record</h3>
        <dl>
          <DetailRow label="Status"><span className={`adm-badge adm-badge-${r.status}`}>{r.status}</span></DetailRow>
          {r.completedAt && <DetailRow label="Completed">{formatDate(r.completedAt)}</DetailRow>}
          <DetailRow label="Registered">{formatDate(r.registeredAt)}</DetailRow>
          <DetailRow label="Age confirmed">18+ confirmed</DetailRow>
        </dl>
      </section>
    </>
  );
}

export default function RegistrationDrawer({ registration, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const r = registration;
  return (
    <>
      <div className="adm-backdrop adm-backdrop-drawer" onClick={onClose} />
      <aside className="adm-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-drawer-title">
        <header className="adm-drawer-header">
          <div>
            <span className="adm-mono adm-muted">{r.registrationNumber}</span>
            <h2 id="adm-drawer-title">{r.fullName}</h2>
            <Link href={`/admin/students/${r.id}`} className="adm-btn adm-btn-ghost adm-btn-sm adm-drawer-link">
              <UserRound size={14} /> Open student profile
            </Link>
          </div>
          <button className="adm-icon-btn" onClick={onClose} aria-label="Close details"><X size={18} /></button>
        </header>
        <div className="adm-drawer-body">
          <RegistrationDetails registration={r} />
        </div>
      </aside>
    </>
  );
}
