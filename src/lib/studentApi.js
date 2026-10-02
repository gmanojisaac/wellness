// Client helpers for the student portal. Students have no table access; everything goes
// through the student_*() database functions, which only act on the caller's own rows.
import { createClient } from './supabase/client';
import { TIME_SLOTS } from './programs';

export class StudentAuthError extends Error {}

let client;
export function getSupabase() {
  if (!client) client = createClient();
  return client;
}

async function studentRpc(fn, args) {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (!error) return data;
  if (error.code === 'PGRST301' || error.code === 'PGRST303') {
    throw new StudentAuthError('Your session has expired. Please sign in again.');
  }
  if (error.code === '42501') throw new Error('This course is not available on your account.');
  if (error.code === 'P0002') throw new Error('This class is not available yet.');
  if (/could not find the function/i.test(error.message || '')) {
    throw new Error('The student portal is not available yet. Please try again later.');
  }
  throw new Error('Something went wrong. Please try again.');
}

// Returns the signed-in user, or null.
export async function getCurrentStudent() {
  const { data: { user } } = await getSupabase().auth.getUser();
  return user || null;
}

export async function signIn(email, password) {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error('The email or password is incorrect.');
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

function toEnrolment(row) {
  return {
    id: row.id,
    registrationNumber: row.registration_number,
    fullName: row.full_name,
    groupName: row.group_name,
    groupTitle: row.group_title,
    durationWeeks: row.duration_weeks,
    cadence: row.cadence,
    roomCapacity: row.room_capacity,
    timeSlotLabel: TIME_SLOTS[row.time_slot] || row.time_slot,
    cohortCode: row.cohort_code,
    seatNumber: row.seat_number,
    status: row.status,
    completedAt: row.completed_at,
    totalClasses: Number(row.total_classes),
    completedClasses: Number(row.completed_classes),
  };
}

// The groups the signed-in student is registered for, newest first.
export async function getDashboard() {
  const rows = await studentRpc('student_dashboard');
  return rows.map(toEnrolment);
}

// One course: { registration, group, weeks[] } with classes and videos for released weeks.
export async function getCourse(registrationId) {
  const data = await studentRpc('student_course', { p_registration_id: registrationId });
  const weeks = data.weeks.map((w) => ({
    id: w.id,
    number: w.week_number,
    title: w.title,
    releaseDate: w.release_date,
    released: w.released,
    classCount: Number(w.class_count),
    classes: w.classes.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      completed: c.completed,
      videos: c.videos.map((v) => ({ id: v.id, title: v.title, durationSeconds: v.duration_seconds, sourceType: v.source_type })),
    })),
  }));
  return {
    registration: {
      id: data.registration.id,
      registrationNumber: data.registration.registration_number,
      timeSlotLabel: TIME_SLOTS[data.registration.time_slot] || data.registration.time_slot,
      cohortCode: data.registration.cohort_code,
      seatNumber: data.registration.seat_number,
      status: data.registration.status,
    },
    group: {
      name: data.group.name,
      title: data.group.title,
      description: data.group.description,
      durationWeeks: data.group.duration_weeks,
      cadence: data.group.cadence,
      roomCapacity: data.group.room_capacity,
    },
    weeks,
  };
}

// Marks or unmarks a class. Returns the course status afterwards ('active' | 'completed').
export async function setClassCompleted(registrationId, classId, completed) {
  const data = await studentRpc('student_set_class_completed', {
    p_registration_id: registrationId, p_class_id: classId, p_completed: completed,
  });
  return data.status;
}

// Resolves a video to something playable: { sourceType: 'upload' | 'link', url }.
export async function getVideoUrl(videoId) {
  const response = await fetch('/api/student/video-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The video could not be loaded.');
  return data;
}
