/**
 * components/sparkline.tsx — an area chart in ~40 lines of server-rendered SVG.
 *
 * No charting library: the dashboard needs one line, and shipping Recharts for
 * a single path would add ~100 kB to a page that otherwise needs no JavaScript
 * at all.
 */

export function Sparkline({
  values,
  labels,
  height = 72,
  className,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  className?: string;
}) {
  const width = 600;
  const points = values.length ? values : [0];
  const max = Math.max(...points, 1);
  const stepX = points.length > 1 ? width / (points.length - 1) : width;

  const coords = points.map((value, index) => {
    const x = points.length > 1 ? index * stepX : width / 2;
    const y = height - (value / max) * (height - 8) - 4;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const peak = coords.reduce((best, point, index) => (point[1] < best[1] ? point : best), coords[0]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Views over the last ${points.length} days. Peak ${max}.`}
      style={{ width: '100%', height }}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {peak ? <circle cx={peak[0]} cy={peak[1]} r="3.5" fill="var(--accent)" /> : null}
      {labels?.length ? <title>{`${labels[0]} → ${labels[labels.length - 1]}`}</title> : null}
    </svg>
  );
}
