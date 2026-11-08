"use client";

import { useState } from "react";

export function Sparkline({ values, color = "#3097b2", w = 96, h = 32 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${w - 2} ${h} L2 ${h} Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface BarDatum { label: string; sub?: string; values: number[] }
/** Stacked bar chart with hover tooltips and sparse axis labels. */
export function StackedBars({ data, colors, names, height = 190, labelEvery = 5 }: { data: BarDatum[]; colors: string[]; names: string[]; height?: number; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.values.reduce((a, b) => a + b, 0)), 1);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const bw = 100 / data.length;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} role="img" aria-label={`Bar chart: ${names.join(", ")}`}>
        {ticks.map((t, i) => <line key={i} x1="0" x2="100" y1={(height / 4) * (1 - t / max)} y2={(height / 4) * (1 - t / max)} stroke="#e4ece9" strokeWidth=".3" vectorEffect="non-scaling-stroke" />)}
        {data.map((d, i) => {
          let y = height / 4;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * bw} y={0} width={bw} height={height / 4} fill="transparent" />
              {d.values.map((v, k) => {
                const hh = (v / max) * (height / 4);
                y -= hh;
                return hh > 0 ? <rect key={k} x={i * bw + bw * 0.16} y={y} width={bw * 0.68} height={hh} rx=".5" fill={colors[k]} opacity={hover === null || hover === i ? 1 : 0.55} /> : null;
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>
        {data.map((d, i) => <span key={i} style={{ width: `${bw}%`, textAlign: "center", visibility: i % labelEvery === 0 ? "visible" : "hidden", whiteSpace: "nowrap" }}>{d.label}</span>)}
      </div>
      {hover !== null && (
        <div className="ch-tip" style={{ left: `${(hover + 0.5) * bw}%`, top: 24 }}>
          <b>{data[hover].sub ?? data[hover].label}</b>{data[hover].values.map((v, k) => <div key={k}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: colors[k], marginRight: 6 }} />{names[k]}: {v}</div>)}
        </div>
      )}
    </div>
  );
}

export function HBars({ items, color = "#3097b2", format = (v: number) => String(v) }: { items: { label: string; value: number }[]; color?: string; format?: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((i) => (
        <div key={i.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 5 }}><span style={{ color: "var(--deep)", fontWeight: 600 }}>{i.label}</span><span className="tnum" style={{ color: "var(--ink-2)" }}>{format(i.value)}</span></div>
          <div className="a-meter"><i style={{ width: `${(i.value / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
      {items.length === 0 && <p className="a-hint">Nothing to show yet.</p>}
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Heatmap({ cells, from = 7, to = 19 }: { cells: { weekday: number; hour: number; n: number }[]; from?: number; to?: number }) {
  const max = Math.max(...cells.map((c) => c.n), 1);
  const get = (wd: number, h: number) => cells.find((c) => c.weekday === wd && c.hour === h)?.n ?? 0;
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `38px repeat(${hours.length}, minmax(28px, 1fr))`, gap: 3, minWidth: 460 }}>
        <span />
        {hours.map((h) => <span key={h} style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center" }}>{h}</span>)}
        {DAYS.map((d, wd) => (
          <div key={d} style={{ display: "contents" }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 600, alignSelf: "center" }}>{d}</span>
            {hours.map((h) => {
              const n = get(wd, h);
              return <span key={h} title={`${d} ${h}:00 · ${n} appointments`} style={{ height: 26, borderRadius: 6, background: n ? `rgba(48,151,178,${0.15 + (n / max) * 0.85})` : "#eef4f2" }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Donut({ parts, size = 132 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = 46, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Share by source">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#eef4f2" strokeWidth="16" />
        {parts.map((p) => {
          const len = (p.value / total) * c;
          const el = <circle key={p.label} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />;
          off += len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 20, fill: "#14364b" }}>{total}</text>
        <text x="60" y="74" textAnchor="middle" style={{ fontSize: 9, fill: "#5a7282" }}>bookings</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
        {parts.map((p) => <span key={p.label} style={{ display: "flex", gap: 8, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 3, background: p.color }} /> <b style={{ color: "var(--deep)" }}>{p.label}</b> <span style={{ color: "var(--ink-2)" }}>{Math.round((p.value / total) * 100)}%</span></span>)}
      </div>
    </div>
  );
}
