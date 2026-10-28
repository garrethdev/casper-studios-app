/**
 * CSRF defence for cookie-authenticated endpoints, layered on top of
 * SameSite=Strict cookies: a state-changing request must come from our own origin.
 */
export function isSameOrigin(req: { method: string; origin?: string | null; secFetchSite?: string | null }, allowed: string[]): boolean {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method.toUpperCase())) return true;
  if (req.origin) return allowed.includes(req.origin);
  // Some same-origin requests omit Origin; trust only the browser-set Fetch Metadata header.
  return req.secFetchSite === 'same-origin';
}
