import { formatDuration } from "@/lib/utils";
import type { TrafficPoint } from "@/db/queries/users";

/**
 * 30-day reader trend.
 *
 * A dependency-free SVG chart rendered on the server: no charting library, no
 * hydration, no canvas. It is a dozen lines of path arithmetic, and because it is
 * server-rendered it costs the client bundle exactly nothing — which is why the
 * dashboard can afford to show a chart at all.
 *
 * The `preserveAspectRatio="none"` trick lets the SVG stretch to its container
 * without recalculating coordinates on the client.
 */
export function TrafficChart({ points }: { points: TrafficPoint[] }) {
  const width = 600;
  const height = 140;
  const padding = 4;

  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-ink-faint">
        Not enough reading activity yet — the trend appears after a couple of days.
      </p>
    );
  }

  const readers = points.map((point) => point.readers);
  const peak = Math.max(...readers, 1);
  const totalSeconds = points.reduce((sum, point) => sum + point.seconds, 0);
  const totalReaders = readers.reduce((sum, value) => sum + value, 0);

  const stepX = (width - padding * 2) / (points.length - 1);
  const toY = (value: number) => height - padding - (value / peak) * (height - padding * 2);

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${padding + index * stepX},${toY(point.readers)}`).join(" ");
  const area = `${line} L${width - padding},${height - padding} L${padding},${height - padding} Z`;

  // Compare the most recent week against the one before it for a sentence, not
  // just a shape — see the design note about metrics-as-sentences.
  const lastWeek = readers.slice(-7).reduce((sum, value) => sum + value, 0);
  const previousWeek = readers.slice(-14, -7).reduce((sum, value) => sum + value, 0);
  const delta = previousWeek > 0 ? Math.round(((lastWeek - previousWeek) / previousWeek) * 100) : 0;

  return (
    <figure className="w-full">
      <figcaption className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{totalReaders}</span> reader sessions in the last{" "}
          {points.length} days
        </span>
        <span className="text-[0.8125rem] text-ink-faint">
          {formatDuration(totalSeconds)} of attention
          {previousWeek > 0 ? (
            <>
              {" · "}
              <span className={delta >= 0 ? "text-success" : "text-ink-faint"}>
                {delta >= 0 ? "up" : "down"} {Math.abs(delta)}% week over week
              </span>
            </>
          ) : null}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily readers over the last ${points.length} days, peaking at ${peak} on a single day`}
        className="h-32 w-full overflow-visible"
      >
        <defs>
          <linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#traffic-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 flex justify-between text-2xs text-ink-faint">
        <span>{points[0]?.day.slice(5)}</span>
        <span>peak {peak} readers/day</span>
        <span>{points.at(-1)?.day.slice(5)}</span>
      </div>
    </figure>
  );
}
