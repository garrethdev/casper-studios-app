import type { Verdict } from '@leanplate/contracts';

const TEXT: Record<Verdict['label'], string> = {
  'on-track': 'On track',
  okay: 'Okay',
  'off-track': 'A little off track',
};

/** Color AND words AND a different shape, so the meaning never depends on color alone. */
export function VerdictBadge({ label }: { label: Verdict['label'] }) {
  return (
    <span className={`badge ${label}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {label === 'on-track' && <path d="M3 8.5l3.2 3L13 4.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
        {label === 'okay' && <path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
        {label === 'off-track' && (
          <>
            <path d="M8 3.5v5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="8" cy="12" r="1.3" fill="currentColor" />
          </>
        )}
      </svg>
      {TEXT[label]}
    </span>
  );
}

export const verdictText = (l: Verdict['label']) => TEXT[l];
