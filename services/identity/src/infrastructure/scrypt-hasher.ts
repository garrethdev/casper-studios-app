import { hashPassword, verifyAgainstDummy, verifyPassword } from '@leanplate/security';
import type { PasswordHasher } from '../application';

export class ScryptHasher implements PasswordHasher {
  hash(password: string) {
    return hashPassword(password);
  }
  verify(password: string, stored: string) {
    return verifyPassword(password, stored);
  }
  async verifyDummy(password: string) {
    await verifyAgainstDummy(password);
  }
}
