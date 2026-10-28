import { randomToken, sha256Hex, signAccessToken } from '@leanplate/security';
import { ACCESS_TTL_SECONDS } from '../domain';
import type { TokenIssuer } from '../application';

/** Access tokens are ES256 JWTs from the shared security package; refresh tokens are 256 random bits stored only as SHA-256. */
export class JoseTokenIssuer implements TokenIssuer {
  constructor(private privateKeyPem: string) {}

  async issueAccessToken(userId: string, sessionId: string) {
    const token = await signAccessToken({ privateKeyPem: this.privateKeyPem, userId, sessionId, ttlSeconds: ACCESS_TTL_SECONDS });
    return { token, expiresIn: ACCESS_TTL_SECONDS };
  }

  newRefreshToken() {
    const token = randomToken(32);
    return { token, hash: sha256Hex(token) };
  }

  hashRefreshToken(token: string) {
    return sha256Hex(token);
  }
}
