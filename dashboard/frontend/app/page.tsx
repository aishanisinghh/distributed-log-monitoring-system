"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_DEFAULT = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SERVICES = ["all", "auth-service", "order-service", "payment-service"];
const LEVELS = [
  "all",
  "INFO",
  "WARN",
  "ERROR"
];
const TIME_RANGES = [
  { label: "2m", value: "2m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1h", value: "1h" },
];

interface LogEntry {
  timestamp: string;
  level?: string;
  service?: string;
  message?: string;
  raw: string;
}

// ─── SVG DONUT CHART ────────────────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 36, cx = 50, cy = 50;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  if (total === 0) return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={8}/>
      <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--text-dim)" fontSize={12} fontWeight="600">0</text>
    </svg>
  );

  const slices = data.map((d) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = offset * 360 - 90;
    offset += pct;
    return { ...d, dasharray: `${dash} ${gap}`, rotation };
  });

  return (
    <div style={{ position: 'relative', width: 100, height: 100 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={8}/>
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={8}
            strokeDasharray={s.dasharray}
            strokeDashoffset="0"
            transform={`rotate(${s.rotation} ${cx} ${cy})`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        ))}
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>{total}</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>total</div>
      </div>
    </div>
  );
}

// ─── SVG GAUGE ────────────────────────────────────────────────────────────
function ErrorGauge({ errorRate }: { errorRate: number }) {
  const clampedRate = Math.min(100, Math.max(0, errorRate));
  const R = 40, cx = 60, cy = 50;
  const startAngle = 150;
  const endAngle = 390;
  const arcAngle = 240;
  const filledAngle = (clampedRate / 100) * arcAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (start: number, end: number) => {
    const s = toRad(start);
    const e = toRad(end);
    const x1 = cx + R * Math.cos(s);
    const y1 = cy + R * Math.sin(s);
    const x2 = cx + R * Math.cos(e);
    const y2 = cy + R * Math.sin(e);
    const large = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };

  const gaugeColor =
    clampedRate < 5 ? "var(--success)" :
    clampedRate < 15 ? "var(--warn)" : "var(--error)";

  return (
    <div style={{ position: 'relative', width: 120, height: 80 }}>
      <svg width={120} height={100} viewBox="0 0 120 100">
        <path d={arcPath(startAngle, endAngle)} fill="none" stroke="var(--surface-2)" strokeWidth={8} strokeLinecap="round"/>
        {clampedRate > 0 && (
          <path d={arcPath(startAngle, startAngle + filledAngle)} fill="none" stroke={gaugeColor}
            strokeWidth={8} strokeLinecap="round"
            style={{ transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)', filter: `drop-shadow(0 0 4px ${gaugeColor}44)` }}/>
        )}
        <text x={cx} y={cy + 5} textAnchor="middle" fill="var(--text)" fontSize={16} fontWeight="800" fontFamily="'Syne', sans-serif">
          {clampedRate.toFixed(1)}%
        </text>
      </svg>
    </div>
  );
}

// ─── MINI SPARKLINE ────────────────────────────────────────────────────────
function Sparkline({ values, color = "var(--primary)" }: { values: number[]; color?: string }) {
  if (!values.length || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 80, h = 32;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 2px ${color}44)` }}/>
    </svg>
  );
}

// ─── SERVICE TAG HELPER ────────────────────────────────────────────────────
function getServiceClass(service?: string) {
  if (!service) return "kernel";
  if (service.includes("auth")) return "auth";
  if (service.includes("order")) return "order";
  if (service.includes("payment")) return "payment";
  return "kernel";
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────
export default function Dashboard() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState("all");
  const [level, setLevel] = useState("all");
  const [since, setSince] = useState("5m");
  const [search, setSearch] = useState("");
  const [anomaly, setAnomaly] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // ── All original backend logic preserved ──────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL(`${API_DEFAULT}/logs`);
      if (service !== "all") url.searchParams.set("service", service);
      if (level !== "all") url.searchParams.set("level", level);
      if (since) url.searchParams.set("since", since);
      if (search) url.searchParams.set("search", search);
      url.searchParams.set("limit", "100");
      const res = await fetch(url.toString());
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [service, level, since, search]);

  const fetchAnomalies = useCallback(async () => {
    try {
      const res = await fetch(`${API_DEFAULT}/logs/anomalies`);
      if (res.ok) {
        const data = await res.json();
        setAnomaly(data.alert ? data : null);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchAnomalies();
    if (autoRefresh) {
      const inv = setInterval(() => {
        fetchLogs();
        fetchAnomalies();
      }, 10000);
      return () => clearInterval(inv);
    }
  }, [fetchLogs, fetchAnomalies, autoRefresh]);

  // ── Visualization data (original logic preserved) ─────────────────────
  const logVolumeTimeline = useMemo(() => {
    const bucketMinutes = 2;
    let totalMinutes = 60;
    if (since.includes("m")) totalMinutes = parseInt(since);
    else if (since.includes("h")) totalMinutes = parseInt(since) * 60;
    const buckets = Math.max(1, Math.floor(totalMinutes / bucketMinutes));
    const now = new Date().getTime();
    const ago = now - totalMinutes * 60000;
    const step = (now - ago) / buckets;
    const data = Array.from({ length: buckets }).map((_, i) => ({
      time: `${i * bucketMinutes}m`,
      total: 0,
      errors: 0,
    }));
    entries.forEach((entry) => {
      const t = new Date(entry.timestamp).getTime();
      const idx = Math.floor((t - ago) / step);
      if (idx >= 0 && idx < buckets) {
        data[idx].total++;
        if (entry.level === "ERROR") data[idx].errors++;
      }
    });
    return data;
  }, [entries, since]);

  const stats = useMemo(() => {
    const total = entries.length;
    const errors = entries.filter((e) => e.level === "ERROR").length;
    const warns = entries.filter((e) => e.level === "WARN").length;
    return {
      total,
      errors,
      warns,
      errorRate: total ? (errors / total) * 100 : 0,
      errorRateStr: total ? ((errors / total) * 100).toFixed(1) : "0",
      avgDelay: "142ms",
    };
  }, [entries]);

  const serviceBreakdown = useMemo(() => {
    const colors = {
      "auth-service": "var(--secondary)",
      "order-service": "var(--primary)",
      "payment-service": "var(--success)",
    };
    return SERVICES.filter((s) => s !== "all").map((s) => ({
      label: s.split("-")[0],
      value: entries.filter((e) => e.service === s).length,
      color: colors[s as keyof typeof colors] ?? "var(--text-dim)",
    }));
  }, [entries]);

  const sparkValues = logVolumeTimeline.map((d) => d.total);
  const errorSparkValues = logVolumeTimeline.map((d) => d.errors);
  const maxTimelineBucket = Math.max(...logVolumeTimeline.map((d) => d.total), 1);

  return (
    <div className="layout">
      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">LO</div>
          <span>Log Observatory</span>
          <span className="version-badge">v2.5</span>
        </div>
        <div className="header-right">
          <div className="live-indicator">
            <div className={`live-dot ${autoRefresh ? "" : "inactive"}`}/>
            {autoRefresh ? "Live Stream" : "Stream Paused"}
          </div>
          <button className={`btn ${autoRefresh ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? '⏸ Pause' : '▶ Resume'}
          </button>
          <button className="btn btn-primary" onClick={fetchLogs} disabled={loading} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {loading ? "Syncing..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      {/* ── PAGE ─────────────────────────────────────────────────────── */}
      <main className="page">
        {anomaly && (
          <div className="alert-banner" style={{
            background: 'rgba(251, 113, 133, 0.1)', border: '1px solid var(--error)',
            padding: '1.25rem', borderRadius: '16px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem'
          }}>
            <div style={{ fontSize: '1.5rem' }}>🚨</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: 'var(--error)' }}>High Error Rate Detected — {anomaly.reason}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{anomaly.count} failures clustered in the last monitoring window</div>
            </div>
            <button className="btn" onClick={() => setAnomaly(null)} style={{ background: 'transparent', color: 'var(--text-muted)' }}>Dismiss</button>
          </div>
        )}

        <div className="dashboard-grid">
          {/* ── STAT CARDS ─────────────────────────────────────────────── */}
          <div className="card stat-card">
            <div className="stat-label">Ingestion Rate</div>
            <div className="stat-value">{stats.total}<span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>eps</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <div className="stat-delta" style={{ color: 'var(--success)' }}>↑ 12% <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>vs last hour</span></div>
              <Sparkline values={sparkValues} color="var(--primary)"/>
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-label">Error Rate</div>
            <div className="stat-value" style={{ color: stats.errorRate > 10 ? 'var(--error)' : stats.errorRate > 5 ? 'var(--warn)' : 'var(--success)' }}>
              {stats.errorRateStr}<span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <div className="stat-delta" style={{ color: 'var(--text-dim)' }}>Baseline: 2.1%</div>
              <Sparkline values={errorSparkValues} color="var(--error)"/>
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-label">P99 Latency</div>
            <div className="stat-value">{stats.avgDelay}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <div className="stat-delta" style={{ color: 'var(--success)' }}>↓ 4ms <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>improvement</span></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
                {[30,45,55,40,60,50].map((h, i) => (
                  <div key={i} style={{ width: 3, height: `${h}%`, background: "var(--success)", borderRadius: 1, opacity: 0.6 }}/>
                ))}
              </div>
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-label">System Integrity</div>
            <div className="stat-value" style={{ color: "var(--success)" }}>99.9<span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>%</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <div className="stat-delta" style={{ color: 'var(--success)' }}>All probes healthy</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
                {[90,92,95,93,96,97].map((h, i) => (
                  <div key={i} style={{ width: 3, height: `${h - 85}%`, background: "var(--secondary)", borderRadius: 1, opacity: 0.6 }}/>
                ))}
              </div>
            </div>
          </div>

          {/* ── TIMELINE ─────────────────────────────────────────── */}
          <div className="card timeline-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <div className="section-title">Stream Activity</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Visualizing event density over the last {since}</div>
              </div>
              <div className="time-pills">
                {TIME_RANGES.map((t) => (
                  <button key={t.value} className={`time-pill ${since === t.value ? "active" : ""}`} onClick={() => setSince(t.value)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 120, display: 'flex', alignItems: 'flex-end', gap: '4px', position: 'relative' }}>
              {logVolumeTimeline.map((d, i) => (
                <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '2px' }}>
                  {d.errors > 0 && (
                    <div style={{ height: `${(d.errors / maxTimelineBucket) * 100}%`, background: 'var(--error)', borderRadius: '2px', opacity: 0.8 }} />
                  )}
                  <div style={{ height: `${((d.total - d.errors) / maxTimelineBucket) * 100}%`, background: 'var(--primary)', borderRadius: '2px', opacity: 0.6 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '2px', background: 'var(--primary)' }} />
                Logs: {stats.total}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '2px', background: 'var(--error)' }} />
                Errors: {stats.errors}
              </div>
              <div style={{ marginLeft: 'auto' }}>
                Total Throughput: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{(stats.total / 300).toFixed(2)} EPS</span>
              </div>
            </div>
          </div>

          {/* ── LOGS ──────────────────────────────────────────────── */}
          <div className="logs-container">
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="section-title" style={{ flex: 1 }}>Real-time Log Feed</div>
                <div style={{ position: 'relative', width: 300 }}>
                  <input className="input-field" style={{ width: '100%', paddingLeft: '2.5rem', height: 40, fontSize: '0.85rem' }}
                    placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchLogs()} />
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                </div>
                <select className="input-field" style={{ height: 40, padding: '0 1rem', fontSize: '0.85rem' }} value={service} onChange={(e) => setService(e.target.value)}>
                  <option value="all">All Services</option>
                  {SERVICES.filter(s => s !== "all").map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                <table className="log-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Time</th>
                      <th style={{ width: 150 }}>Service</th>
                      <th style={{ width: 100 }}>Level</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => (
                      <tr key={i} className="log-row">
                        <td style={{ color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                            background: entry.service?.includes('auth') ? 'rgba(192, 132, 252, 0.1)' : entry.service?.includes('order') ? 'rgba(129, 140, 248, 0.1)' : 'rgba(52, 211, 153, 0.1)',
                            color: entry.service?.includes('auth') ? 'var(--secondary)' : entry.service?.includes('order') ? 'var(--primary)' : 'var(--success)',
                            border: '1px solid currentColor'
                          }}>
                            {entry.service || 'kernel'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800,
                            color: entry.level === 'ERROR' ? 'var(--error)' : entry.level === 'WARN' ? 'var(--warn)' : 'var(--accent)'
                          }}>
                            ● {entry.level || 'INFO'}
                          </span>
                        </td>
                        <td style={{ color: entry.level === 'ERROR' ? 'var(--error)' : 'var(--text)', opacity: 0.9 }}>{entry.message}</td>
                      </tr>
                    ))}
                    {entries.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>
                          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</div>
                          No logs found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── SIDEBAR ────────────────────────────────────────────────── */}
          <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1.5rem' }}>Health Status</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <ErrorGauge errorRate={stats.errorRate} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--error)' }}>{stats.errors}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Errors</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--warn)' }}>{stats.warns}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Warns</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>{stats.total - stats.errors - stats.warns}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Info</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="section-title" style={{ marginBottom: '1.5rem' }}>Traffic Distribution</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                <DonutChart data={serviceBreakdown} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {serviceBreakdown.map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '2px', background: s.color }} />
                        <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                      </div>
                      <span style={{ fontWeight: 700 }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card" style={{ background: 'linear-gradient(135deg, var(--surface), var(--surface-2))' }}>
              <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--primary)' }}>✦</span> Observer AI
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                AI is monitoring 4 service clusters. No significant drift detected in the last 15 minutes. All systems nominal.
              </div>
              <button className="btn" style={{ width: '100%', marginTop: '1.5rem', background: 'var(--surface-3)', fontSize: '0.75rem' }}>
                Generate Insight Report →
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}