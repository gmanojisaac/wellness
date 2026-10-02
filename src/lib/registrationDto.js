import { ROOM_CAPACITY, TIME_SLOTS, PARTICIPATION_STYLES } from './programs';

// Maps a `registrations` row (snake_case) to the API/UI shape with derived labels.
// `group` is the row's group in toGroupDto() shape, when the caller has it.
export function toRegistrationDto(row, group) {
  return {
    id: row.id,
    registrationNumber: row.registration_number,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    whatsAppOptIn: Boolean(row.whatsapp_opt_in),
    groupId: row.group_id,
    groupNumber: group ? group.number : null,
    groupName: group ? group.name : row.group_id,
    groupTitle: group ? group.title : '',
    timeSlot: row.time_slot,
    timeSlotLabel: TIME_SLOTS[row.time_slot] || row.time_slot,
    cohortNumber: row.cohort_number,
    cohortCode: row.cohort_code,
    seatNumber: row.seat_number,
    maxRoomCapacity: group ? group.roomCapacity : ROOM_CAPACITY,
    participationStyle: row.participation_style,
    participationStyleLabel: PARTICIPATION_STYLES[row.participation_style] || row.participation_style,
    primaryGoal: row.primary_goal,
    notes: row.notes,
    is18OrOver: true,
    status: row.status,
    completedAt: row.completed_at || null,
    registeredAt: row.registered_at,
    orientationLink: '/classroom',
    nextSessionDate: row.time_slot.startsWith('sat') ? 'Upcoming Saturday' : 'Upcoming Sunday',
  };
}
