import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../lib/supabase/server';

const TYPES = new Set(['invite', 'magiclink', 'email', 'signup', 'recovery', 'email_change']);

// Only allow redirects inside this app
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/activate';
}

// Landing page of the links in Supabase auth emails (see supabase/templates). Verifies the
// single-use token, which signs the learner in through cookies, then continues.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = safeNext(searchParams.get('next'));

  if (tokenHash && TYPES.has(type)) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.warn('[auth/confirm] Link rejected:', error.message);
  }

  // Expired, already used or malformed: the activation page offers a fresh link
  return NextResponse.redirect(new URL('/activate?link=expired', request.url));
}
