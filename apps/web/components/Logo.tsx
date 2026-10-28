export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="var(--primary)" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="var(--primary-soft)" strokeWidth="2" />
      <path d="M11 20c0-5 3-8 10-9-.5 6-3 9-8 9-.7 0-1.4-.1-2-.3z" fill="var(--primary-ink)" />
    </svg>
  );
}
