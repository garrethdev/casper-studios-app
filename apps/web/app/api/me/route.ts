import { UserDto } from '@leanplate/contracts';
import { AppError } from '@leanplate/security';
import { ok, withUser } from '@/lib/server/bff';
import { expectShape } from '@/lib/server/upstream';

export const dynamic = 'force-dynamic';

export const GET = withUser({}, async (c) => {
  const [user, hasProfile] = await Promise.all([
    c.identity('/v1/me'),
    c.meals('/v1/profile').then(
      () => true,
      (e) => {
        if (e instanceof AppError && e.status === 404) return false;
        throw e;
      },
    ),
  ]);
  return ok({ user: expectShape(UserDto, user, 'identity'), hasProfile });
});
