// Enrolment lifecycle (registrations.state) as the learner sees it. Shared by the
// student portal pages. The database is what enforces the transitions.

export const STATE_LABELS = {
  invited: 'Activation pending',
  activated: 'Enrolment pending',
  payment_pending: 'Enrolment pending',
  enrolled: 'Choose class time',
  cohort_assigned: 'Cohort assigned',
  active: 'Active',
  program_complete: 'Completed',
  certified: 'Certified',
  withdrawn: 'Withdrawn',
  account_locked: 'Locked',
  certificate_review: 'Certificate in review',
};

const COURSE_STATES = new Set(['cohort_assigned', 'active', 'program_complete', 'certified']);

export function hasCourseAccess(state) {
  return COURSE_STATES.has(state);
}

// The one thing the learner should do next for an enrolment, or null.
export function nextStep(enrolment) {
  switch (enrolment.state) {
    case 'invited':
      return { label: 'Activate my account', href: '/activate' };
    case 'activated':
    case 'payment_pending':
      return {
        label: enrolment.feePaise > 0 ? 'Complete enrolment' : 'Confirm enrolment',
        href: `/student/enroll/${enrolment.id}`,
      };
    case 'enrolled':
      return { label: 'Choose my class time', href: `/student/enroll/${enrolment.id}` };
    default:
      return null;
  }
}

export function formatFee(paise, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(paise / 100);
}

const IST = 'Asia/Kolkata';

export function formatSessionTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: IST, weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }) + ' IST';
}
