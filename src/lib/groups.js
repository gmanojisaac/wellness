// Groups are managed in the admin panel and stored in the `groups` table.
// Shared by the API route handlers, the registration form and the admin panel.

export const GROUP_STATUSES = {
  draft: 'Draft',
  open: 'Open for registration',
  closed: 'Closed',
  archived: 'Archived',
};

export const GROUP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

// Maps a `groups` row (snake_case) to the API/UI shape. `index` is its position in the list it came from.
export function toGroupDto(row, index = 0) {
  return {
    id: row.id,
    number: index + 1,
    name: row.name,
    title: row.title,
    audience: row.audience || row.name,
    duration: `${row.duration_weeks} Weeks`,
    durationWeeks: row.duration_weeks,
    cadence: row.cadence,
    cohortSize: `Max ${row.room_capacity} / Room`,
    badge: `${row.duration_weeks} Weeks`,
    focus: row.description,
    eligibilityNotice: row.eligibility_notice,
    roomCapacity: row.room_capacity,
    status: row.status,
    sortOrder: row.sort_order,
    // Present only on admin_list_groups() rows
    registrationCount: Number(row.registration_count || 0),
    weekCount: Number(row.week_count || 0),
    classCount: Number(row.class_count || 0),
  };
}
