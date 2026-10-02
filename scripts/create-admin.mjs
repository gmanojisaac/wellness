// Creates a Supabase Auth user and grants admin access, or resets the password
// of an existing user and makes sure they are an admin.
//
//   npm run admin:create -- admin@example.com                      (prompts for the password)
//   ADMIN_PASSWORD=... npm run admin:create -- admin@example.com   (non-interactive)
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.

import fs from 'node:fs';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Suppress echo of typed characters
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match || data.users.length < 1000) return match || null;
  }
}

async function main() {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Usage: npm run admin:create -- <email>');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) fail('No terminal available for the password prompt. Set ADMIN_PASSWORD instead.');
    password = await promptHidden('Password (min 10 chars): ');
    if (password !== (await promptHidden('Confirm password: '))) fail('Passwords do not match.');
  }
  if (password.length < 10) fail('Password must be at least 10 characters.');

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let userId;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error) {
    userId = created.data.user.id;
    console.log(`Created user ${email}.`);
  } else if (created.error.code === 'email_exists' || created.error.status === 422) {
    const existing = await findUserByEmail(supabase, email);
    if (!existing) throw created.error;
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
    userId = existing.id;
    console.log(`User ${email} already existed; password updated.`);
  } else {
    throw created.error;
  }

  const { error: adminError } = await supabase.from('admins').upsert({ user_id: userId });
  if (adminError) {
    fail(`Could not grant admin access: ${adminError.message}\nHas the migration in supabase/migrations been applied?`);
  }
  console.log(`${email} is an admin. Sign in at /admin.`);
}

main().catch((err) => fail(err.message || String(err)));
