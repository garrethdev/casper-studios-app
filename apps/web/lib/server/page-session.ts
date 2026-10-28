import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UserDto, type Profile, type UserDto as User } from '@leanplate/contracts';
import { AppError } from '@leanplate/security';
import { cookieNames, isProduction } from '../cookies';
import { expectShape, identity, meals } from './upstream';

export interface PageSession {
  user: User;
  profile: Profile | null;
}

/**
 * Server Components cannot set cookies, so they only VERIFY the access token (identity and meals both
 * check the signature). They never refresh: rotating a refresh token without being able to store the new
 * one would lock the user out. An expired or rejected session sends the browser to the landing page, whose
 * client code renews it through POST /api/auth/refresh and returns to where the person was going.
 */
async function load(): Promise<PageSession | null> {
  const jar = await cookies();
  const at = jar.get(cookieNames(isProduction()).access)?.value;
  if (!at) return null;
  try {
    const [user, profile] = await Promise.all([
      identity('/v1/me', { accessToken: at }),
      meals<Profile>('/v1/profile', { accessToken: at }).catch((e) => {
        if (e instanceof AppError && e.status === 404) return null;
        throw e;
      }),
    ]);
    return { user: expectShape(UserDto, user, 'identity'), profile };
  } catch (e) {
    if (e instanceof AppError && e.status === 401) return null;
    throw e;
  }
}

export async function requireUser(opts: { profile: 'required' | 'absent' | 'any'; next?: string }): Promise<PageSession> {
  const session = await load();
  if (!session) redirect(opts.next ? `/?expired=1&next=${encodeURIComponent(opts.next)}` : '/?expired=1');
  if (opts.profile === 'required' && !session.profile) redirect('/onboarding');
  if (opts.profile === 'absent' && session.profile) redirect('/dashboard');
  return session;
}
