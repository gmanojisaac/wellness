import 'server-only';

// Emails the app sends through SMTP (src/lib/integrations/mailer.js). Each returns
// { subject, text, html } for sendMail().

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function layout({ heading, paragraphs, button, footnote }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2d27">
  <p style="font-size:13px;color:#5f746b">Everyday Mental Wellness</p>
  <h2 style="margin:8px 0 12px">${escape(heading)}</h2>
  ${paragraphs.map((p) => `<p>${escape(p)}</p>`).join('\n  ')}
  <p style="margin:28px 0">
    <a href="${escape(button.url)}" style="background:#2a9d8f;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${escape(button.label)}</a>
  </p>
  <p style="font-size:13px;color:#5f746b">${escape(footnote)}</p>
</div>`;
}

function plainText({ heading, paragraphs, button, footnote }) {
  return [heading, '', ...paragraphs, '', `${button.label}: ${button.url}`, '', footnote, '', 'Everyday Mental Wellness'].join('\n');
}

function build(subject, parts) {
  return { subject, text: plainText(parts), html: layout(parts) };
}

export function activationEmail({ fullName, url }) {
  return build('Activate your Everyday Mental Wellness learner account', {
    heading: fullName ? `Hello, ${fullName}` : 'Hello',
    paragraphs: [
      'Your learner account is ready for onboarding.',
      'Use the secure button below to activate your account, create your own password and continue your enrolment.',
    ],
    button: { label: 'Activate My Account', url },
    footnote: 'This activation link is single-use and expires after a limited period for your security. We never send passwords by email. If you did not request this, you can ignore this email.',
  });
}

export function signInEmail({ url }) {
  return build('Your Everyday Mental Wellness sign-in link', {
    heading: 'Continue to your learner account',
    paragraphs: ['Use the secure button below to sign in and continue where you left off.'],
    button: { label: 'Continue', url },
    footnote: 'This link is single-use and expires after a limited period. If you did not request it, you can ignore this email.',
  });
}

// 4 hours before class
export function classTodayEmail({ fullName, groupName, when, time, lesson, url }) {
  return build(`Your Everyday Mental Wellness class is today at ${time} IST`, {
    heading: `Hi ${fullName}`,
    paragraphs: [`Your ${groupName} class is today (${when} IST).`, `Theme: ${lesson}`],
    button: { label: 'Open my class', url },
    footnote: 'The class opens 10 minutes before the start time.',
  });
}

// 2 minutes before class (sent by email while WhatsApp is switched off)
export function classStartingEmail({ fullName, lesson, url }) {
  return build('Your live class starts in 2 minutes', {
    heading: `Hi ${fullName}`,
    paragraphs: ['Your live class begins in 2 minutes.', `Lesson: ${lesson}`],
    button: { label: 'Join class now', url },
    footnote: 'This link only works for your account and cohort.',
  });
}
