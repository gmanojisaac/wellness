'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, ChevronLeft, ChevronRight, Inbox, LoaderCircle, MessageCircle, RotateCcw, Search } from 'lucide-react';
import { listGroupStudents, setStudentStatus } from '../../lib/adminContent';
import { toRegistrationDto } from '../../lib/registrationDto';
import { useDebounced } from '../../lib/useDebounced';

const PAGE_SIZE = 50;
const STATUS_LABELS = { active: 'Active', completed: 'Completed' };
const dateFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

// Students registered in one group, with Active / Completed tabs. `onError` receives load and save failures.
export default function GroupStudents({ group, onError }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [settledKey, setSettledKey] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const router = useRouter();

  const q = useDebounced(search.trim(), 300);
  const requestKey = JSON.stringify([group.id, status, q, page, reloadKey]);
  const loading = settledKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    listGroupStudents(group.id, { status, q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((data) => !cancelled && setResult(data))
      .catch((err) => !cancelled && onError(err))
      .finally(() => !cancelled && setSettledKey(requestKey));
    return () => { cancelled = true; };
  }, [group.id, status, q, page, requestKey, onError]);

  const students = useMemo(() => (result?.rows || []).map((row) => toRegistrationDto(row, group)), [result, group]);
  const counts = result?.counts || { active: 0, completed: 0 };
  const tabs = [
    { id: '', label: 'All', count: counts.active + counts.completed },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'completed', label: 'Completed', count: counts.completed },
  ];
  const totalPages = Math.max(1, Math.ceil((result?.total || 0) / PAGE_SIZE));

  const changeStatus = async (student, next) => {
    setBusyId(student.id);
    try {
      await setStudentStatus(student.id, next);
    } catch (err) {
      onError(err);
    }
    setBusyId(null);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="adm-card">
      <div className="adm-toolbar">
        <div className="adm-tabs adm-tabs-pill" role="tablist" aria-label="Student status">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={status === tab.id}
              className={status === tab.id ? 'is-active' : ''}
              onClick={() => { setStatus(tab.id); setPage(1); }}
            >
              {tab.label} <b>{tab.count}</b>
            </button>
          ))}
        </div>
        <div className="adm-input-icon adm-search">
          <Search size={16} />
          <input
            className="adm-input"
            type="search"
            placeholder="Search name, email, phone or reg. no."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Contact</th>
              <th>Time slot</th>
              <th>Room</th>
              <th>Registered</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody className={loading && result ? 'is-loading' : ''}>
            {!result && loading && (
              <tr><td colSpan={7} className="adm-table-empty"><LoaderCircle size={22} className="adm-spin adm-muted" /></td></tr>
            )}
            {result && students.length === 0 && (
              <tr>
                <td colSpan={7} className="adm-table-empty">
                  <Inbox size={28} className="adm-muted" />
                  <p>
                    {q ? 'No students match this search.'
                      : status ? `No ${STATUS_LABELS[status].toLowerCase()} students in this group.`
                        : 'No one has registered for this group yet.'}
                  </p>
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr
                key={s.id}
                className="adm-row-clickable"
                tabIndex={0}
                onClick={() => router.push(`/admin/students/${s.id}`)}
                onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), router.push(`/admin/students/${s.id}`))}
                title="Open student profile"
              >
                <td className="adm-col-main">
                  <span className="adm-strong">{s.fullName}</span>
                  <div className="adm-mono adm-muted adm-small">{s.registrationNumber}</div>
                </td>
                <td>
                  <div><a href={`mailto:${s.email}`} className="adm-link" onClick={(e) => e.stopPropagation()}>{s.email}</a></div>
                  {s.phone && (
                    <div className="adm-muted adm-small adm-nowrap">
                      {s.phone}
                      {s.whatsAppOptIn && <MessageCircle size={12} className="adm-wa" aria-label="WhatsApp opt-in" />}
                    </div>
                  )}
                </td>
                <td className="adm-small">{s.timeSlotLabel}</td>
                <td className="adm-nowrap">
                  <span className="adm-mono">{s.cohortCode}</span>
                  <div className="adm-muted adm-small">Seat {s.seatNumber}/{s.maxRoomCapacity}</div>
                </td>
                <td className="adm-nowrap">
                  {dateFormat.format(new Date(s.registeredAt))}
                  {s.completedAt && <div className="adm-muted adm-small">Completed {dateFormat.format(new Date(s.completedAt))}</div>}
                </td>
                <td><span className={`adm-badge adm-badge-${s.status}`}>{STATUS_LABELS[s.status] || s.status}</span></td>
                <td className="adm-nowrap adm-row-actions">
                  {s.status === 'completed' ? (
                    <button className="adm-btn adm-btn-ghost adm-btn-sm" disabled={busyId === s.id} onClick={(e) => { e.stopPropagation(); changeStatus(s, 'active'); }}>
                      <RotateCcw size={14} /> Mark active
                    </button>
                  ) : (
                    <button className="adm-btn adm-btn-ghost adm-btn-sm" disabled={busyId === s.id} onClick={(e) => { e.stopPropagation(); changeStatus(s, 'completed'); }}>
                      <CircleCheck size={14} /> Mark completed
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result && result.total > PAGE_SIZE && (
        <div className="adm-pagination">
          <span className="adm-muted">
            Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + students.length} of {result.total}
          </span>
          <div className="adm-pagination-controls">
            <button className="adm-icon-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft size={18} />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button className="adm-icon-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
