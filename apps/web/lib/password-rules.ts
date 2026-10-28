/**
 * Live hints while typing a new password. The identity service applies the real policy (including a list of
 * common passwords); this only mirrors the rules a person can see and fix straight away.
 */
export function passwordRules(password: string, email: string) {
  const p = password.normalize('NFKC');
  const local = (email.split('@')[0] ?? '').toLowerCase();
  return {
    lengthOk: p.length >= 12,
    variedOk: new Set(p).size >= 6,
    noEmailOk: !(local.length >= 4 && p.toLowerCase().includes(local)),
  };
}
