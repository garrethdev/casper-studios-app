import type { Targets } from '@leanplate/contracts';

const n = (v: number) => Math.round(v).toLocaleString();

/** Shows the plan exactly as the server computed it. The formula is never repeated in the browser. */
export function PlanCard({ targets }: { targets: Targets }) {
  return (
    <div className="stack">
      <div className="facts">
        <div className="fact">
          <div className="n">{n(targets.dailyKcal)}</div>
          <div className="l">calories a day</div>
        </div>
        <div className="fact">
          <div className="n">{n(targets.proteinG)} g</div>
          <div className="l">protein goal</div>
        </div>
        <div className="fact">
          <div className="n">{n(targets.fiberG)} g</div>
          <div className="l">fiber goal</div>
        </div>
        <div className="fact">
          <div className="n">{n(targets.sugarCapG)} g</div>
          <div className="l">added sugar cap</div>
        </div>
        <div className="fact">
          <div className="n">{targets.weeksToGoal === null ? '—' : `${n(targets.weeksToGoal)} wk`}</div>
          <div className="l">{targets.weeksToGoal === null ? (targets.mode === 'maintain' ? 'to maintain, no end date' : 'no estimate yet') : 'estimated to your goal'}</div>
        </div>
      </div>
      {targets.notes.length > 0 && (
        <ul>
          {targets.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
