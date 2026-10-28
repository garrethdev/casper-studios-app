import { weekdayShort } from '@/lib/dates';

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Calories eaten against the daily target. Over the target the ring turns amber and the words stay kind. */
export function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const R = 84;
  const C = 2 * Math.PI * R;
  const frac = target > 0 ? Math.min(consumed / target, 1) : 0;
  const remaining = target - consumed;
  const over = remaining < 0;
  const summary = over
    ? `${fmt(consumed)} of ${fmt(target)} calories eaten, ${fmt(-remaining)} over the target`
    : `${fmt(consumed)} of ${fmt(target)} calories eaten, ${fmt(remaining)} left`;
  return (
    <div className="ring ring-wrap">
      <svg viewBox="0 0 200 200" role="img" aria-label={summary}>
        <circle className="ring-track" cx="100" cy="100" r={R} fill="none" strokeWidth="16" />
        <circle
          className={`ring-bar${over ? ' over' : ''}`}
          cx="100"
          cy="100"
          r={R}
          fill="none"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 100 100)"
        />
        <text x="100" y="98" textAnchor="middle" fontSize="38" fontWeight="800">
          {fmt(Math.abs(remaining))}
        </text>
        <text className="sub" x="100" y="124" textAnchor="middle" fontSize="14">
          {over ? 'kcal over' : 'kcal left'}
        </text>
      </svg>
      <p className="muted small" style={{ margin: 0 }}>
        {fmt(consumed)} eaten of {fmt(target)} kcal
      </p>
      {over && <p className="small" style={{ margin: 0 }}>A little over today is okay. One day does not decide your progress.</p>}
    </div>
  );
}

export function MacroBar({ label, value, goal, unit = 'g', kind }: { label: string; value: number; goal: number; unit?: string; kind: 'goal' | 'cap' }) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  const over = kind === 'cap' && value > goal;
  const left = goal - value;
  const status =
    kind === 'goal'
      ? left > 0
        ? `${fmt(left)} ${unit} to go`
        : 'Goal reached'
      : over
        ? `${fmt(-left)} ${unit} over the cap`
        : `${fmt(left)} ${unit} under the cap`;
  return (
    <div className="macro">
      <div className="top">
        <span>{label}</span>
        <span>
          {fmt(value)} / {fmt(goal)} {unit}
        </span>
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(goal, 1)}
        aria-valuenow={Math.min(Math.round(value), Math.max(goal, 1))}
        aria-valuetext={`${fmt(value)} of ${fmt(goal)} ${unit}. ${status}`}
      >
        <span className={over ? 'over' : ''} style={{ width: `${pct}%` }} />
      </div>
      <div className="help">{status}</div>
    </div>
  );
}

/** Seven daily totals as bars with the target drawn as a dashed line. */
export function WeekChart({ week, target, today }: { week: { date: string; kcal: number }[]; target: number; today: string }) {
  const W = 320;
  const H = 170;
  const top = 18;
  const bottom = 26;
  const plotH = H - top - bottom;
  const max = Math.max(target * 1.25, ...week.map((d) => d.kcal), 1);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const slot = W / Math.max(week.length, 1);
  const bw = Math.min(28, slot * 0.6);
  const desc = week.map((d) => `${weekdayShort(d.date)} ${fmt(d.kcal)} kcal`).join(', ');
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Calories for the last 7 days against a target of ${fmt(target)}. ${desc}`}>
        {week.map((d, i) => {
          const x = slot * i + (slot - bw) / 2;
          const h = Math.max((d.kcal / max) * plotH, d.kcal > 0 ? 2 : 0);
          const isToday = d.date === today;
          return (
            <g key={d.date}>
              {d.kcal === 0 ? (
                <rect className="bar-empty" x={x} y={top + plotH - 3} width={bw} height={3} rx={1.5} />
              ) : (
                <rect className={d.kcal > target ? 'bar-over' : 'bar-ok'} x={x} y={top + plotH - h} width={bw} height={h} rx={5} />
              )}
              {d.kcal > 0 && (
                <text x={x + bw / 2} y={y(d.kcal) - 4} textAnchor="middle">
                  {fmt(d.kcal)}
                </text>
              )}
              <text className={isToday ? 'today-label' : ''} x={x + bw / 2} y={H - 8} textAnchor="middle">
                {isToday ? 'Today' : weekdayShort(d.date)}
              </text>
            </g>
          );
        })}
        <line className="target" x1={0} x2={W} y1={y(target)} y2={y(target)} />
        <text x={W - 2} y={y(target) - 4} textAnchor="end">
          target {fmt(target)}
        </text>
      </svg>
    </div>
  );
}
