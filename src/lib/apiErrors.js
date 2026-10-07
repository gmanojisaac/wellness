import 'server-only';
import { NextResponse } from 'next/server';
import { NotConfiguredError } from './integrations/config';

export function fail(status, error, extra) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

// Last-resort handler for route handlers. Integrations without keys answer 503 with a
// clear message instead of a generic failure.
export function serverError(tag, error, message = 'Something went wrong. Please try again in a moment.') {
  if (error instanceof NotConfiguredError) {
    console.warn(`[${tag}] ${error.message}`);
    return fail(503, `${error.service} is not set up yet. Please try again later.`, { notConfigured: error.service });
  }
  console.error(`[${tag}] Failed:`, error?.message || error);
  return fail(500, message);
}

// Database errors that mean "not yours / not signed in".
export function isAuthError(error) {
  return error?.code === '42501' || String(error?.code || '').startsWith('PGRST3');
}
