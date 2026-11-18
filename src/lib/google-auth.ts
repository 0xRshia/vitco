import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createSession, hash } from './auth';
import { one, run, transaction } from './database';
import type { User } from './types';
import * as v from './validation';

const stateCookie = 'vitco_google_state';
const discovery = 'https://accounts.google.com/.well-known/openid-configuration';
type GoogleConfig = { clientId: string; secret: string; origin: string };
type Attempt = { verifier: string; user_id: string | null; next: string };
type Endpoints = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};
let metadata: { value: Endpoints; until: number } | undefined;
function configuration(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const origin = process.env.APP_ORIGIN?.trim();
  if (!clientId || !secret || !origin) return null;
  try {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))
    )
      return null;
    return { clientId, secret, origin };
  } catch {
    return null;
  }
}
export const googleAvailable = () => Boolean(configuration());
function sameValue(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
}
function localNext(value: string | null, origin: string, fallback: string) {
  if (!value?.startsWith('/') || value.length > 300) return fallback;
  try {
    const route = new URL(value, origin);
    return route.origin === origin && !route.pathname.startsWith('/api/')
      ? route.pathname + route.search
      : fallback;
  } catch {
    return fallback;
  }
}
async function endpoints(): Promise<Endpoints> {
  if (metadata && metadata.until > Date.now()) return metadata.value;
  const response = await fetch(discovery, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  v.ensure(response.ok, 'ورود با گوگل موقتاً در دسترس نیست.', 502);
  const value = v.object(await response.json());
  v.ensure(value.issuer === 'https://accounts.google.com', 'پاسخ ورود گوگل معتبر نیست.', 502);
  for (const field of ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint'] as const) {
    const url = new URL(String(value[field]));
    v.ensure(
      url.protocol === 'https:' &&
        /(?:^|\.)(?:google\.com|googleapis\.com)$/.test(url.hostname) &&
        !url.username &&
        !url.password,
      'پاسخ ورود گوگل معتبر نیست.',
      502,
    );
  }
  metadata = { value: value as Endpoints, until: Date.now() + 3600000 };
  return metadata.value;
}
export async function googleSignIn(request: NextRequest, user: User | null, callback: boolean) {
  const config = configuration();
  v.ensure(config, 'ورود با گوگل هنوز فعال نشده است.', 503);
  const redirectUri = config.origin + '/api/auth/google/callback';
  const query = request.nextUrl.searchParams;
  const failure = (path: string, issue: string) => {
    const target = new URL(path, config.origin);
    target.searchParams.set('google', issue);
    const response = NextResponse.redirect(target);
    response.cookies.set(stateCookie, '', { path: '/api/auth/google', maxAge: 0 });
    return response;
  };
  if (!callback) {
    if (request.headers.get('sec-fetch-site') === 'cross-site') return failure('/login', 'session');
    const provider = await endpoints();
    const state = randomBytes(32).toString('base64url'),
      verifier = randomBytes(48).toString('base64url');
    run('DELETE FROM oauth_attempts WHERE expires<=?', Date.now());
    run(
      'INSERT INTO oauth_attempts(state_hash,verifier,user_id,next,expires) VALUES (?,?,?,?,?)',
      hash(state),
      verifier,
      user?.id ?? null,
      localNext(query.get('next'), config.origin, user ? '/settings' : '/profile'),
      Date.now() + 10 * 60000,
    );
    const target = new URL(provider.authorization_endpoint);
    target.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    const response = NextResponse.redirect(target);
    response.cookies.set(stateCookie, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.origin.startsWith('https:'),
      path: '/api/auth/google',
      maxAge: 600,
    });
    return response;
  }
  const state = query.get('state'),
    cookie = request.cookies.get(stateCookie)?.value;
  const back = user ? '/settings' : '/login';
  if (!state || !cookie || !/^[A-Za-z0-9_-]{43}$/.test(state) || !sameValue(state, cookie))
    return failure(back, 'session');
  const attempt = one<Attempt>(
    'DELETE FROM oauth_attempts WHERE state_hash=? AND expires>? RETURNING verifier,user_id,next',
    hash(state),
    Date.now(),
  );
  if (!attempt || attempt.user_id !== (user?.id ?? null)) return failure(back, 'session');
  if (!query.get('code')) return failure(back, 'cancelled');
  try {
    const provider = await endpoints();
    const token = await fetch(provider.token_endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({
        code: query.get('code')!,
        client_id: config.clientId,
        client_secret: config.secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: attempt.verifier,
      }),
    });
    if (!token.ok) return failure(back, 'failed');
    const access = v.object(await token.json()).access_token;
    if (typeof access !== 'string' || !access) return failure(back, 'failed');
    const response = await fetch(provider.userinfo_endpoint, {
      headers: { Authorization: 'Bearer ' + access },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return failure(back, 'failed');
    const profile = v.object(await response.json());
    if (profile.email_verified !== true) return failure(back, 'email');
    const email = v.email(profile.email),
      subject = v.text(profile.sub, 'شناسه گوگل', 1, 150);
    const result = transaction(() => {
      const linked = one<{ user_id: string; suspended: number }>(
        `SELECT a.user_id,u.suspended FROM google_accounts a JOIN users u ON u.id=a.user_id WHERE a.subject=?`,
        subject,
      );
      if (linked)
        return !linked.suspended && (!user || linked.user_id === user.id)
          ? { id: linked.user_id }
          : { error: 'linked' };
      if (user) {
        if (one('SELECT 1 FROM google_accounts WHERE user_id=?', user.id))
          return { error: 'linked' };
        // Linking requires an authenticated Vitco session. An existing email is never claimed by matching it alone.
        run('INSERT INTO google_accounts(subject,user_id) VALUES (?,?)', subject, user.id);
        return { id: user.id };
      }
      if (one('SELECT 1 FROM users WHERE email=?', email)) return { error: 'existing' };
      const id = randomUUID(),
        name = v.text(profile.name, 'نام حساب گوگل', 2, 160).slice(0, 80);
      run(
        'INSERT INTO users(id,name,email,created_at) VALUES (?,?,?,?)',
        id,
        name,
        email,
        new Date().toISOString(),
      );
      run('INSERT INTO google_accounts(subject,user_id) VALUES (?,?)', subject, id);
      return { id };
    });
    if (!result.id) return failure(back, result.error || 'failed');
    const reply = NextResponse.redirect(new URL(attempt.next, config.origin));
    reply.cookies.set(stateCookie, '', { path: '/api/auth/google', maxAge: 0 });
    if (!user) createSession(result.id, reply);
    return reply;
  } catch {
    return failure(back, 'failed');
  }
}
