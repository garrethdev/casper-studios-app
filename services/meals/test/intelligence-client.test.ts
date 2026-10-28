import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeJwt } from 'jose';
import { httpIntelligence } from '../src/infrastructure/intelligence-client';

const SECRET = 's'.repeat(40);

describe('intelligence adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a meals->intelligence token with the IP hash and request id, and no user id', async () => {
    let captured: Request | undefined;
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      captured = new Request(url, init);
      return new Response(JSON.stringify({ headline: 'ok', tips: [], citations: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const ai = httpIntelligence('http://ai.local', () => SECRET);
    await ai.feedback({ totals: { kcal: 1, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0 }, label: 'okay', flags: [] }, { userId: 'user-1', clientIpHash: 'iphash', requestId: 'req-9' });

    expect(captured!.url).toBe('http://ai.local/v1/feedback');
    expect(captured!.headers.get('x-request-id')).toBe('req-9');
    expect(captured!.headers.get('authorization')).toBeNull();
    const claims = decodeJwt(captured!.headers.get('x-service-token')!);
    expect(claims.iss).toBe('meals');
    expect(claims.aud).toBe('intelligence');
    expect(claims.cip).toBe('iphash');
    expect(claims).not.toHaveProperty('uid');
    expect(await captured!.text()).not.toContain('user-1');
  });

  it('turns an upstream crash into a safe 502 that carries the upstream reference', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'internal', message: 'boom', requestId: 'up-42' } }), { status: 500 }));
    const ai = httpIntelligence('http://ai.local', () => SECRET);
    await expect(ai.feedback({ totals: { kcal: 1, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0 }, label: 'okay', flags: [] }, { userId: 'u' })).rejects.toMatchObject({ status: 502, message: expect.stringContaining('up-42') });
  });
});
