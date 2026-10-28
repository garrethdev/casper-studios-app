const COMMON = new Set([
  'password1234', 'password12345', 'password123!', '123456789012', '1234567890123', 'qwertyuiop12', 'qwertyuiopas',
  'letmein12345', 'iloveyou1234', 'welcome12345', 'admin1234567', 'changeme1234', 'passw0rd1234', 'abc123456789',
  'monkey123456', 'dragon123456', 'football1234', 'baseball1234', 'trustno1trust', 'superman1234',
]);

/** Length-first policy in the spirit of NIST 800-63B: no composition rules, but block the obvious. */
export function checkPasswordPolicy(password: string, email: string): string[] {
  const problems: string[] = [];
  const p = password.normalize('NFKC');
  if (p.length < 12) problems.push('Use at least 12 characters.');
  if (p.length > 128) problems.push('Use at most 128 characters.');
  const lower = p.toLowerCase();
  if (COMMON.has(lower)) problems.push('That password is too common.');
  if (new Set(p).size < 6) problems.push('Use more variety in the characters.');
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lower.includes(local)) problems.push('Do not include your email name in the password.');
  if (/^(?:0123456789|1234567890|abcdefghij|qwertyuiop)/i.test(p)) problems.push('Avoid keyboard or number sequences.');
  return problems;
}
