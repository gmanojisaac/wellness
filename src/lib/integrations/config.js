import 'server-only';

// Thrown when an integration is called before its keys are in the environment. Route
// handlers turn it into a 503 so the rest of the app keeps working during development.
export class NotConfiguredError extends Error {
  constructor(service, missing) {
    super(`${service} is not configured yet. Set ${missing.join(', ')} in the environment.`);
    this.service = service;
    this.missing = missing;
  }
}

export function missingEnv(names) {
  return names.filter((name) => !process.env[name]);
}

export function requireEnv(service, names) {
  const missing = missingEnv(names);
  if (missing.length > 0) throw new NotConfiguredError(service, missing);
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

// Public URL of the learner app, used in emails, WhatsApp buttons and auth redirects.
export function appUrl(path = '') {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${path}`;
}
