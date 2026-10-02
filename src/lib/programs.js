// Time slots and participation styles offered at registration, shared by the API route
// handlers and the admin panel. Groups themselves are managed in the admin panel (see
// ./groups.js); PROGRAM_GROUPS is only the fallback shown when the database is unreachable.

export const ROOM_CAPACITY = 6;

export const PROGRAM_GROUPS = [
  {
    id: 'group1',
    number: 1,
    name: 'General Adults (18+)',
    title: 'The Resilience Continuum: Foundational Self-Care',
    audience: 'General Adults (18+)',
    duration: '52 Weeks • 10 Mins / Weekend',
    cadence: '1 Weekend Lesson per Week',
    cohortSize: 'Max 6 Adults / Room',
    badge: '52 Weeks',
    focus: 'Emotional regulation, cognitive defusion, and healthy boundaries for lifelong mental wellness.',
    eligibilityNotice: 'Available to any adult aged 18 and above.'
  },
  {
    id: 'group2',
    number: 2,
    name: 'Parents & Caregivers',
    title: 'The Regulated Parent: Co-Regulation & Family Climate',
    audience: 'Parents & Caregivers',
    duration: '52 Weeks • 10 Mins / Weekend',
    cadence: '1 Weekend Lesson per Week',
    cohortSize: 'Max 6 Parents / Room',
    badge: '52 Weeks',
    focus: 'Parental self-regulation, emotion coaching for children, and calm family communication without child diagnosis.',
    eligibilityNotice: 'Exclusively for parents/guardians. Teaches caregiver skills only; never diagnoses minors.'
  },
  {
    id: 'group3',
    number: 3,
    name: 'University & College Students (18+)',
    title: 'Academic Stress, Imposter Syndrome & Social Courage',
    audience: 'University & College Students (18+)',
    duration: '4 Weeks • 10 Lessons Total',
    cadence: 'Week 1: 7 daily lessons • Weeks 2–4: 1 weekend lesson/week',
    cohortSize: 'Max 6 Students / Room',
    badge: '4 Weeks',
    focus: 'Study panic de-escalation, imposter syndrome defusion, roommate communication, and campus isolation relief.',
    eligibilityNotice: 'Exclusively for college and graduate students aged 18+.'
  },
  {
    id: 'group4',
    number: 4,
    name: 'Workplace Professionals',
    title: 'Corporate Burnout Recovery & Work-Life Boundaries',
    audience: 'Workplace Professionals',
    duration: '4 Weeks • 10 Lessons Total',
    cadence: 'Week 1: 7 daily lessons • Weeks 2–4: 1 weekend lesson/week',
    cohortSize: 'Max 6 Professionals / Room',
    badge: '4 Weeks',
    focus: 'Corporate burnout recovery, asynchronous Slack/email firewalls, and guilt-free boundary formulas.',
    eligibilityNotice: 'For working professionals aged 18+. 100% confidential from employers.'
  }
];

export const TIME_SLOTS = {
  sat_morning: 'Saturday Morning (10:00 AM - 10:10 AM)',
  sat_afternoon: 'Saturday Afternoon (3:00 PM - 3:10 PM)',
  sun_morning: 'Sunday Morning (10:00 AM - 10:10 AM)',
  sun_evening: 'Sunday Evening (6:00 PM - 6:10 PM)'
};

export const PARTICIPATION_STYLES = {
  active_voice: 'Active Voice (Interactive 6-person peer discussion)',
  listener_first: 'Listener First (Observe & reflect, speak when ready)'
};

export const DEFAULT_TIME_SLOT = 'sat_morning';
export const DEFAULT_PARTICIPATION_STYLE = 'active_voice';
export const DEFAULT_PRIMARY_GOAL = 'Personal Mental Wellness & Habit Building';

export function findGroup(groupId) {
  return PROGRAM_GROUPS.find((g) => g.id === groupId) || null;
}
