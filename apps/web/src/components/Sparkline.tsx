'use client';

import { useId, useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
}

/** Mini gráfico em SVG. Sem dependências externas. */
export function Sparkline({
  data,
  width = 320,
  height = 80,
  color = 'rgb(194 115 58)',
  fillColor,
  showAxis = false,
  showGrid = false,
}: SparklineProps) {
  const gradId = useId().replace(/:/g, '_');

  const { path, area, points } = useMemo(() => {
    if (data.length === 0) return { path: '', area: '', points: [] as { x: number; y: number }[] };
    const pad = 6;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const max = Math.max(100, ...data);
    const min = 0;
    const step = data.length > 1 ? w / (data.length - 1) : w;
    const pts = data.map((v, i) => ({
      x: pad + i * step,
      y: pad + h - ((v - min) / (max - min || 1)) * h,
    }));

    // path com curva suave (Catmull-Rom → Bezier)
    let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }

    const area = `${path} L ${pts[pts.length - 1].x.toFixed(2)} ${(pad + h).toFixed(
      2,
    )} L ${pts[0].x.toFixed(2)} ${(pad + h).toFixed(2)} Z`;

    return { path, area, points: pts };
  }, [data, width, height]);

  if (data.length === 0) return null;

  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {showGrid && (
        <g opacity={0.4}>
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1={0}
              y1={(height / 3) * i + 0.5}
              x2={width}
              y2={(height / 3) * i + 0.5}
              stroke="rgb(var(--line))"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ))}
        </g>
      )}

      {showAxis && (
        <line x1={6} y1={height - 6} x2={width - 6} y2={height - 6} stroke="rgb(var(--line))" strokeWidth={1} />
      )}

      <path d={area} fill={fillColor ?? `url(#grad-${gradId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last && (
        <>
          <circle cx={last.x} cy={last.y} r={7} fill={color} opacity={0.18} />
          <circle cx={last.x} cy={last.y} r={4} fill={color} stroke="rgb(var(--surface-elevated))" strokeWidth={2} />
        </>
      )}
    </svg>
  );
}
