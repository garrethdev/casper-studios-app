/** A friendly first name guessed from an email address ("sam.lee42@x.com" -> "Sam"). Empty when it would look odd. */
export function friendlyName(email: string): string {
  const token = (email.split('@')[0] ?? '').split(/[^a-zA-Z]+/).find((t) => t.length > 0) ?? '';
  if (token.length < 2 || token.length > 16) return '';
  return token[0]!.toUpperCase() + token.slice(1).toLowerCase();
}
