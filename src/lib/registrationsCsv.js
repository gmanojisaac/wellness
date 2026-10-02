// Builds a CSV of registrations (DTO shape) for download from the admin panel.

// Neutralizes spreadsheet formula injection from user-submitted text.
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  ['Registration No.', 'registrationNumber'],
  ['Registered At (UTC)', 'registeredAt'],
  ['Full Name', 'fullName'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['WhatsApp Opt-in', (r) => (r.whatsAppOptIn ? 'Yes' : 'No')],
  ['Group', 'groupName'],
  ['Time Slot', 'timeSlotLabel'],
  ['Cohort', 'cohortCode'],
  ['Seat', 'seatNumber'],
  ['Participation Style', 'participationStyleLabel'],
  ['Primary Goal', 'primaryGoal'],
  ['Notes', 'notes'],
  ['Status', 'status'],
];

export function registrationsToCsv(rows) {
  const lines = [CSV_COLUMNS.map(([header]) => csvCell(header)).join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map(([, key]) => csvCell(typeof key === 'function' ? key(r) : r[key])).join(','));
  }
  // BOM so Excel opens it as UTF-8
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(csv, filename) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
