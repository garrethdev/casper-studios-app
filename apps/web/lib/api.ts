import type { AnalyzeMealBody, AnalyzeMealResult, DaySummary, MealRecord, Profile, ProfileInput, SaveMealBody, Targets, UserDto } from '@leanplate/contracts';

/** The only way the browser talks to the server: JSON in, JSON out, same origin, cookies attached by the browser. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Options {
  signal?: AbortSignal;
  /** Sign-in and sign-up answer 401 themselves; those must show an error instead of redirecting. */
  noAuthRedirect?: boolean;
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time: parallel 401s wait for the same answer instead of replaying the single-use token. */
function renewSession(soft = false): Promise<boolean> {
  refreshing ??= fetch(soft ? '/api/auth/refresh?soft=1' : '/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } })
    .then(async (r) => (soft && r.ok ? ((await r.json().catch(() => null)) as { refreshed?: boolean } | null)?.refreshed === true : r.ok))
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

async function once(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Network error');
  }
}

export function goToSignIn() {
  const here = window.location.pathname;
  window.location.assign(`/?expired=1&next=${encodeURIComponent(here)}`);
}

export async function request<T>(method: string, path: string, body?: unknown, opts: Options = {}): Promise<T> {
  let res = await once(method, path, body, opts.signal);
  if (res.status === 401 && !opts.noAuthRedirect) {
    // Renew, then try again. If renewing fails, a parallel request may still have refreshed the cookies, so try once more before giving up.
    await renewSession();
    res = await once(method, path, body, opts.signal);
    if (res.status === 401) {
      goToSignIn();
      throw new ApiError(401, 'unauthorized', 'Please sign in again');
    }
  }
  if (res.status === 204) return undefined as T;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? 'Something went wrong');
  }
  return json as T;
}

const get = <T>(path: string, o?: Options) => request<T>('GET', path, undefined, o);
const query = (date: string, tz: number) => `date=${encodeURIComponent(date)}&tz=${tz}`;

export const api = {
  register: (email: string, password: string) => request<{ user: UserDto }>('POST', '/api/auth/register', { email, password }, { noAuthRedirect: true }),
  login: (email: string, password: string) => request<{ ok: true }>('POST', '/api/auth/login', { email, password }, { noAuthRedirect: true }),
  logout: () => request<void>('POST', '/api/auth/logout', undefined, { noAuthRedirect: true }),
  /** Quietly tries to renew a session from the refresh cookie. */
  resume: () => renewSession(true),
  me: () => get<{ user: UserDto; hasProfile: boolean }>('/api/me'),
  profile: () => get<Profile>('/api/profile'),
  saveProfile: (input: ProfileInput) => request<{ profile: Profile; targets: Targets }>('PUT', '/api/profile', input),
  targets: () => get<Targets>('/api/targets'),
  summary: (date: string, tz: number, o?: Options) => get<DaySummary>(`/api/summary?${query(date, tz)}`, o),
  meals: (date: string, tz: number, o?: Options) => get<{ meals: MealRecord[] }>(`/api/meals?${query(date, tz)}`, o),
  analyze: (body: AnalyzeMealBody, signal?: AbortSignal) => request<AnalyzeMealResult>('POST', '/api/meals/analyze', body, { signal }),
  saveMeal: (body: SaveMealBody) => request<{ meal: MealRecord }>('POST', '/api/meals', body),
  deleteMeal: (id: string) => request<void>('DELETE', `/api/meals/${encodeURIComponent(id)}`),
  deleteData: () => request<void>('DELETE', '/api/data'),
  deleteAccount: () => request<void>('DELETE', '/api/account'),
};
