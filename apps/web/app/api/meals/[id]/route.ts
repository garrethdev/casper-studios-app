import { AppError } from '@leanplate/security';
import { noContent, withUser } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

export const DELETE = withUser({}, async (c) => {
  const id = c.params.id ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AppError(404, 'not_found', 'Meal not found');
  await c.meals(`/v1/meals/${id}`, { method: 'DELETE' });
  return noContent();
});
