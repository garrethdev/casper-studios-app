import type { TokenPair } from '@leanplate/contracts';
import type { TokenIssuer } from './ports';

export async function buildTokenPair(tokens: TokenIssuer, userId: string, sessionId: string, refreshToken: string): Promise<TokenPair> {
  const access = await tokens.issueAccessToken(userId, sessionId);
  return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn };
}
