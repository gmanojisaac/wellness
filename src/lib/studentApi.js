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
  if (error.code === 'ES001') throw new Error('Please complete enrolment before choosing a class time.');
  if (error.code === 'ES002') throw new Error('This enrolment is already complete.');
  if (error.code === 'EP001') throw new Error('Promo codes are not being accepted right now. Please refresh the page.');
  if (error.code === 'EP002') throw new Error('That promo code is not valid. Check the code in your email and try again.');
  if (error.code === 'EP003') throw new Error('That promo code has already been used the maximum number of times.');
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
    timeSlotLabel: row.time_slot_label || TIME_SLOTS[row.time_slot] || row.time_slot,
    cohortCode: row.cohort_code,
    seatNumber: row.seat_number,
    status: row.status,
    state: row.state,
    phone: row.phone,
    whatsAppOptIn: row.whatsapp_opt_in,
    phoneVerified: row.phone_verified,
    feePaise: row.fee_paise,
    currency: row.currency,
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

// Weekly class times with seats left in the room that is filling now.
export async function getSlotOptions(registrationId) {
  const data = await studentRpc('student_slot_options', { p_registration_id: registrationId });
  return {
    state: data.state,
    roomCapacity: data.room_capacity,
    slots: data.slots.map((s) => ({
      id: s.id, label: s.label, durationMinutes: s.duration_minutes, seatsRemaining: Number(s.seats_remaining),
    })),
  };
}

// Confirms the class time; the database assigns the cohort and seat.
export async function chooseSlot(registrationId, timeSlot) {
  const data = await studentRpc('student_choose_slot', { p_registration_id: registrationId, p_time_slot: timeSlot });
  return {
    state: data.state,
    timeSlotLabel: data.time_slot_label,
    cohortCode: data.cohort_code,
    seatNumber: data.seat_number,
    roomCapacity: data.room_capacity,
  };
}

// Whether enrolment is currently by promo code (true) or by payment (false).
export async function isPromoCheckout() {
  return Boolean(await studentRpc('promo_checkout_enabled'));
}

// Enrols with a promo code instead of a payment (-> ENROLLED).
export async function redeemPromo(registrationId, code) {
  return studentRpc('student_redeem_promo', { p_registration_id: registrationId, p_code: code.trim() });
}

function toSession(s) {
  return {
    id: s.id,
    registrationId: s.registration_id,
    status: s.status,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    joinOpensAt: s.join_opens_at,
    joinClosesAt: s.join_closes_at,
    cohortCode: s.cohort_code,
    groupName: s.group_name,
    weekNumber: s.week_number,
    weekTitle: s.week_title,
    classes: s.classes || [],
  };
}

// The signed-in learner's next live classes, soonest first.
export async function getUpcomingSessions() {
  const rows = await studentRpc('student_upcoming_sessions');
  return rows.map(toSession);
}

// POSTs to one of this app's route handlers and returns the JSON, or throws its message.
async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const sendPhoneCode = (phone) => postJson('/api/account/phone-code', { phone });

// Whether activation asks for a WhatsApp code (false while WhatsApp is switched off).
export async function isPhoneCodeRequired() {
  const response = await fetch('/api/account/phone-code');
  const data = await response.json().catch(() => ({}));
  return data.required === true;
}
export const activateAccount = (payload) => postJson('/api/account/activate', payload);
export const resendActivationLink = (email) => postJson('/api/account/resend-link', { email });
export const startPayment = (registrationId) => postJson('/api/payments/order', { registrationId });
export const confirmPayment = (razorpayResponse) => postJson('/api/payments/verify', razorpayResponse);
export const reportPaymentFailed = (orderId, paymentId, reason) =>
  postJson('/api/payments/failed', { orderId, paymentId, reason });

// A LiveKit token for a live class: { token, serverUrl, staff, session }.
export async function getLiveToken(sessionId) {
  const data = await postJson('/api/live/token', { sessionId });
  return { ...data, session: toSession(data.session) };
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
