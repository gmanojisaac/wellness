'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Inbox,
  LoaderCircle, MessageCircle, RefreshCw, Search, X,
} from 'lucide-react';
import { AdminAuthError, adminRpc, loginRedirectUrl } from '../../../../lib/adminApi';
import { listGroups } from '../../../../lib/adminContent';
import { TIME_SLOTS } from '../../../../lib/programs';
import { toRegistrationDto } from '../../../../lib/registrationDto';
import { downloadCsv, registrationsToCsv } from '../../../../lib/registrationsCsv';
import { useDebounced } from '../../../../lib/useDebounced';
import RegistrationDrawer from '../../../../components/admin/RegistrationDrawer';

const PAGE_SIZES = [10, 25, 50, 100];
const EXPORT_BATCH = 1000;
const TIME_SLOT_OPTIONS = Object.entries(TIME_SLOTS).map(([id, label]) => ({ id, label }));
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const EMPTY_FILTERS = { q: '', groupId: '', timeSlot: '', from: '', to: '' };

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function formatDate(iso) {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}

// Maps UI filters to admin_list_registrations() arguments
function toRpcArgs(query, sort) {
  return {
    p_q: query.q || null,
    p_group_id: query.groupId || null,
    p_time_slot: query.timeSlot || null,
    p_from: query.from || null,
    p_to: query.to || null,
    p_tz: TIME_ZONE,
    p_sort: sort.field,
    p_order: sort.order,
  };
}

async function fetchRegistrations(query, sort, limit, offset) {
  const data = await adminRpc('admin_list_registrations', { ...toRpcArgs(query, sort), p_limit: limit, p_offset: offset });
  return { total: Number(data.total), rows: data.rows };
}

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field;
  const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={`adm-sort-btn ${active ? 'is-active' : ''}`} onClick={() => onSort(field)}>
        {label} <Icon size={13} />
      </button>
    </th>
  );
}

export default function RegistrationsPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [exporting, setExporting] = useState(false);
  // The Groups page links here with ?group=<id>
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    groupId: typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('group') || '',
  }));
  const [sort, setSort] = useState({ field: 'registeredAt', order: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState(null);
  const [settledKey, setSettledKey] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const debouncedQ = useDebounced(filters.q.trim(), 300);

  const handleError = useCallback((err) => {
    if (err instanceof AdminAuthError) router.replace(loginRedirectUrl());
    else setError(err.message);
  }, [router]);

  const query = useMemo(() => ({
    q: debouncedQ,
    groupId: filters.groupId,
    timeSlot: filters.timeSlot,
    from: filters.from,
    to: filters.to,
  }), [debouncedQ, filters.groupId, filters.timeSlot, filters.from, filters.to]);

  useEffect(() => {
    adminRpc('admin_registration_stats').then(setStats).catch(handleError);
    listGroups().then(setGroups).catch(handleError);
  }, [handleError, reloadKey]);

  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const requestKey = JSON.stringify([query, sort, page, pageSize, reloadKey]);
  // Loading until the response for the current request key has settled
  const loading = settledKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    fetchRegistrations(query, sort, pageSize, (page - 1) * pageSize)
      .then(({ total, rows }) => {
        if (cancelled) return;
        setResult({
          registrations: rows,
          pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        });
        setError('');
      })
      .catch((err) => !cancelled && handleError(err))
      .finally(() => !cancelled && setSettledKey(requestKey));
    return () => { cancelled = true; };
  }, [query, sort, page, pageSize, requestKey, handleError]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = [];
      for (let offset = 0; ; offset += EXPORT_BATCH) {
        const { total, rows } = await fetchRegistrations(query, { field: 'registeredAt', order: 'desc' }, EXPORT_BATCH, offset);
        all.push(...rows);
        if (rows.length < EXPORT_BATCH || all.length >= total) break;
      }
      downloadCsv(registrationsToCsv(all.map((r) => toRegistrationDto(r, groupsById[r.group_id]))), `registrations-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      handleError(err);
    } finally {
      setExporting(false);
    }
  };

  const updateFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const handleSort = (field) => {
    setSort((s) => (s.field === field
      ? { field, order: s.order === 'asc' ? 'desc' : 'asc' }
      : { field, order: field === 'registeredAt' ? 'desc' : 'asc' }));
    setPage(1);
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const pagination = result?.pagination;
  const rows = useMemo(
    () => (result?.registrations || []).map((r) => toRegistrationDto(r, groupsById[r.group_id])),
    [result, groupsById]
  );
  const firstRow = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastRow = pagination ? firstRow + rows.length - 1 : 0;

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1>Registrations</h1>
          <p className="adm-muted">Everyone who has signed up through the public registration form.</p>
        </div>
        <div className="adm-page-actions">
          <button className="adm-btn adm-btn-ghost" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'adm-spin' : ''} /> Refresh
          </button>
          <button className="adm-btn adm-btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? <LoaderCircle size={15} className="adm-spin" /> : <Download size={15} />} Export CSV
          </button>
        </div>
      </div>

      {stats && (
        <div className="adm-stats">
          <div className="adm-stat adm-stat-primary">
            <span>Total registrations</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="adm-stat">
            <span>Last 7 days</span>
            <strong>{stats.last7Days}</strong>
          </div>
          <div className="adm-stat">
            <span>WhatsApp opt-ins</span>
            <strong>{stats.whatsAppOptIns}</strong>
          </div>
          <div className="adm-stat adm-stat-groups">
            <span>By group</span>
            <ul>
              {groups.map((g) => ({ groupId: g.id, name: g.name, count: Number(stats.byGroup[g.id] || 0) })).map((g) => (
                <li key={g.groupId}>
                  <button
                    className={filters.groupId === g.groupId ? 'is-active' : ''}
                    onClick={() => updateFilter('groupId', filters.groupId === g.groupId ? '' : g.groupId)}
                    title={`Filter by ${g.name}`}
                  >
                    <span>{g.name}</span>
                    <b>{g.count}</b>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-input-icon adm-search">
            <Search size={16} />
            <input
              className="adm-input"
              type="search"
              placeholder="Search name, email, phone, reg. no. or cohort"
              value={filters.q}
              onChange={(e) => updateFilter('q', e.target.value)}
            />
          </div>
          <select className="adm-input" value={filters.groupId} onChange={(e) => updateFilter('groupId', e.target.value)} aria-label="Group">
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>Group {g.number} · {g.name}</option>)}
          </select>
          <select className="adm-input" value={filters.timeSlot} onChange={(e) => updateFilter('timeSlot', e.target.value)} aria-label="Time slot">
            <option value="">All time slots</option>
            {TIME_SLOT_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <label className="adm-date">
            <span>From</span>
            <input className="adm-input" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => updateFilter('from', e.target.value)} />
          </label>
          <label className="adm-date">
            <span>To</span>
            <input className="adm-input" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => updateFilter('to', e.target.value)} />
          </label>
          {hasFilters && (
            <button className="adm-btn adm-btn-ghost" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
              <X size={15} /> Clear
            </button>
          )}
        </div>

        {error && <div className="adm-alert adm-alert-error adm-card-alert" role="alert">{error}</div>}

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <SortHeader label="Registered" field="registeredAt" sort={sort} onSort={handleSort} />
                <SortHeader label="Name" field="fullName" sort={sort} onSort={handleSort} />
                <SortHeader label="Contact" field="email" sort={sort} onSort={handleSort} />
                <SortHeader label="Group" field="groupId" sort={sort} onSort={handleSort} />
                <th>Time slot</th>
                <SortHeader label="Cohort" field="cohortCode" sort={sort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className={loading && result ? 'is-loading' : ''}>
              {!result && loading && (
                <tr><td colSpan={6} className="adm-table-empty"><LoaderCircle size={22} className="adm-spin adm-muted" /></td></tr>
              )}
              {result && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-table-empty">
                    <Inbox size={28} className="adm-muted" />
                    <p>{hasFilters ? 'No registrations match these filters.' : 'No registrations yet.'}</p>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="adm-row-clickable"
                  tabIndex={0}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(r))}
                >
                  <td className="adm-nowrap">
                    {formatDate(r.registeredAt)}
                    <div className="adm-mono adm-muted adm-small">{r.registrationNumber}</div>
                  </td>
                  <td className="adm-strong">{r.fullName}</td>
                  <td>
                    <div>{r.email}</div>
                    {r.phone && (
                      <div className="adm-muted adm-small adm-nowrap">
                        {r.phone}
                        {r.whatsAppOptIn && <MessageCircle size={12} className="adm-wa" aria-label="WhatsApp opt-in" />}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`adm-badge adm-badge-${r.groupId}`}>G{r.groupNumber}</span> {r.groupName}
                  </td>
                  <td className="adm-small">{r.timeSlotLabel}</td>
                  <td className="adm-nowrap">
                    <span className="adm-mono">{r.cohortCode}</span>
                    <div className="adm-muted adm-small">Seat {r.seatNumber}/{r.maxRoomCapacity}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 0 && (
          <div className="adm-pagination">
            <span className="adm-muted">
              Showing {firstRow}–{lastRow} of {pagination.total}
            </span>
            <div className="adm-pagination-controls">
              <label className="adm-muted">
                Rows
                <select className="adm-input adm-input-sm" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button className="adm-icon-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft size={18} />
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button className="adm-icon-btn" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && <RegistrationDrawer registration={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
