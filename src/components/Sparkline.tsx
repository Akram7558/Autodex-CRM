'use client'
// ─────────────────────────────────────────────────────────────────────
// Sparkline — minimal inline SVG mini-chart.
// ─────────────────────────────────────────────────────────────────────
// Width / height are fixed; the polyline + filled area auto-scale to
// the supplied numeric series. Used by the dashboard KPI cards.
// ─────────────────────────────────────────────────────────────────────

type Props = {
  values: number[]
  width?:  number
  height?: number
  stroke?: string
  fill?:   string
  className?: string
}

export default function Sparkline({
  values,
  width = 120,
  height = 40,
  stroke = '#10b981',
  fill = 'rgba(16,185,129,0.18)',
  className,
}: Props) {
  if (!values || values.length === 0) {
    return <svg width={width} height={height} className={className} aria-hidden />
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const isFlat = max === min
  const range = isFlat ? 1 : max - min
  const stepX = values.length > 1 ? width / (values.length - 1) : 0

  // For an all-zero / flat series, anchor the line near the bottom but
  // not flush against the edge so the stroke remains visible. Otherwise
  // scale the value into the [0, height] range.
  const stripPad = 4
  const yOf = (v: number) => {
    if (isFlat) return height - stripPad
    return height - stripPad - ((v - min) / range) * (height - stripPad * 2)
  }

  const points = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${yOf(v).toFixed(2)}`)
    .join(' ')

  // Area polygon: close the path back to the baseline so we can fill it.
  const areaPoints = `0,${height} ${points} ${width},${height}`

  // Last-point dot
  const last = values[values.length - 1]
  const lastX = (values.length - 1) * stepX
  const lastY = yOf(last)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polygon points={areaPoints} fill={fill} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2.4} fill={stroke} />
    </svg>
  )
}
