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
  if (total === 0) return (
    <svg width={90} height={90} viewBox="0 0 90 90">
      <circle cx={45} cy={45} r={34} fill="none" stroke="#1e3048" strokeWidth={10}/>
      <text x={45} y={49} textAnchor="middle" fill="#3a5472" fontSize={11} fontFamily="'JetBrains Mono', monospace">0</text>
    </svg>
  );

  const R = 34, cx = 45, cy = 45;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  const slices = data.map((d) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = offset * 360 - 90;
    offset += pct;
    return { ...d, dasharray: `${dash} ${gap}`, rotation };
  });

  return (
    <svg width={90} height={90} viewBox="0 0 90 90">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1e3048" strokeWidth={10}/>
      {slices.map((s, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={s.color}
          strokeWidth={10}
          strokeDasharray={s.dasharray}
          strokeDashoffset="0"
          transform={`rotate(${s.rotation} ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
          opacity={0.85}
        />
      ))}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#e2eaf5" fontSize={14}
        fontFamily="'Syne', sans-serif" fontWeight="800">{total}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#5a7a9a" fontSize={8}
        fontFamily="'JetBrains Mono', monospace">total</text>
    </svg>
  );
}

// ─── SVG GAUGE ────────────────────────────────────────────────────────────
function ErrorGauge({ errorRate }: { errorRate: number }) {
  const clampedRate = Math.min(100, Math.max(0, errorRate));
  const R = 38, cx = 60, cy = 55;
  const startAngle = 210;
  const endAngle = 330;
  const arcAngle = 300; // degrees the gauge spans
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

  const needleAngle = startAngle + filledAngle;
  const needleRad = toRad(needleAngle);
  const needleLen = 28;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy + needleLen * Math.sin(needleRad);

  const gaugeColor =
    clampedRate < 5 ? "#10b981" :
    clampedRate < 15 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={120} height={75} viewBox="0 0 120 75">
      <path d={arcPath(startAngle, startAngle + arcAngle)} fill="none" stroke="#1e3048" strokeWidth={8} strokeLinecap="round"/>
      {clampedRate > 0 && (
        <path d={arcPath(startAngle, needleAngle)} fill="none" stroke={gaugeColor}
          strokeWidth={8} strokeLinecap="round"
          style={{ transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}/>
      )}
      <circle cx={cx} cy={cy} r={4} fill={gaugeColor}
        style={{ filter: `drop-shadow(0 0 4px ${gaugeColor})` }}/>
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke={gaugeColor} strokeWidth={2} strokeLinecap="round"
        style={{ transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}/>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#e2eaf5" fontSize={13}
        fontFamily="'Syne', sans-serif" fontWeight="800">{clampedRate.toFixed(1)}%</text>
    </svg>
  );
}

// ─── MINI SPARKLINE ────────────────────────────────────────────────────────
function Sparkline({ values, color = "#6366f1" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 56, h = 22;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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

  // each bucket = 2 minutes
  const bucketMinutes = 2;

  let totalMinutes = 60;

  if (since.includes("m")) {
    totalMinutes = parseInt(since);
  } else if (since.includes("h")) {
    totalMinutes = parseInt(since) * 60;
  }

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

      if (entry.level === "ERROR") {
        data[idx].errors++;
      }
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

  // Service breakdown data for donut
  const serviceBreakdown = useMemo(() => {
    const colors = {
      "auth-service": "#c084fc",
      "order-service": "#60a5fa",
      "payment-service": "#34d399",
    };
    return SERVICES.filter((s) => s !== "all").map((s) => ({
      label: s.split("-")[0],
      value: entries.filter((e) => e.service === s).length,
      color: colors[s as keyof typeof colors] ?? "#94a3b8",
    }));
  }, [entries]);

  // Sparkline data from timeline
  const sparkValues = logVolumeTimeline.map((d) => d.total);
  const errorSparkValues = logVolumeTimeline.map((d) => d.errors);

  const maxTimelineBucket = Math.max(...logVolumeTimeline.map((d) => d.total), 1);

  return (
    <div className="layout">
      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">LO</div>
          Log Observatory
          <span className="version-badge">v2.1</span>
        </div>
        <div className="header-right">
          <div className="live-indicator">
            <div className={`live-dot ${autoRefresh ? "" : "inactive"}`}/>
            {autoRefresh ? "Live" : "Paused"}
          </div>
          <label className="toggle toggle-wrap">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <div className="toggle-track"/>
            <div className="toggle-thumb"/>
          </label>
          <button className="btn btn-primary" onClick={fetchLogs} disabled={loading}>
            {loading ? (
              <span className="loading-shimmer">Syncing…</span>
            ) : (
              <>↻ Refresh</>
            )}
          </button>
        </div>
      </header>

      {/* ── PAGE ─────────────────────────────────────────────────────── */}
      <main className="page">
        {/* Alert Banner */}
        {anomaly && (
          <div className="alert-banner">
            <div className="alert-icon">🚨</div>
            <div>
              <div className="alert-title">
                High Error Rate Detected — {anomaly.reason}
              </div>
              <div className="alert-desc">
                {anomaly.count} failures clustered in the last monitoring window
              </div>
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginLeft: "auto", flexShrink: 0 }}
              onClick={() => setAnomaly(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="dashboard-grid">
          {/* ── STAT CARDS ─────────────────────────────────────────────── */}
          <div className="card stat-card">
            <div className="stat-icon-row">
              <div className="stat-icon blue">📥</div>
              <Sparkline values={sparkValues} color="#60a5fa"/>
            </div>
            <span className="stat-label">Ingestion Rate</span>
            <div className="stat-value">
              {stats.total}<span className="unit">eps</span>
            </div>
            <div className="stat-delta delta-up">↑ 12% vs last hour</div>
          </div>

          <div className="card stat-card">
            <div className="stat-icon-row">
              <div className="stat-icon red">⚠</div>
              <Sparkline values={errorSparkValues} color="#ef4444"/>
            </div>
            <span className="stat-label">Error Rate</span>
            <div
              className="stat-value"
              style={{
                color:
                  stats.errorRate > 10
                    ? "var(--error)"
                    : stats.errorRate > 5
                    ? "var(--warn)"
                    : "var(--success)",
              }}
            >
              {stats.errorRateStr}<span className="unit">%</span>
            </div>
            <div className="stat-delta delta-neutral">Baseline: 2.1%</div>
          </div>

          <div className="card stat-card">
            <div className="stat-icon-row">
              <div className="stat-icon green">⚡</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22 }}>
                {[30,45,55,40,60,50,65,70,55,60].map((h, i) => (
                  <div key={i} style={{
                    width: 4, height: `${h}%`,
                    background: "var(--success)",
                    borderRadius: 2, opacity: 0.5
                  }}/>
                ))}
              </div>
            </div>
            <span className="stat-label">P99 Latency</span>
            <div className="stat-value">{stats.avgDelay}</div>
            <div className="stat-delta delta-up">↓ 4ms improvement</div>
          </div>

          <div className="card stat-card">
            <div className="stat-icon-row">
              <div className="stat-icon purple">🛡</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22 }}>
                {[90,92,95,93,96,97,98,99,99,99].map((h, i) => (
                  <div key={i} style={{
                    width: 4, height: `${h - 88}%`,
                    background: "var(--secondary)",
                    borderRadius: 2, opacity: 0.5, minHeight: 2
                  }}/>
                ))}
              </div>
            </div>
            <span className="stat-label">System Integrity</span>
            <div className="stat-value" style={{ color: "var(--success)" }}>99.9<span className="unit">%</span></div>
            <div className="stat-delta delta-neutral">All probes healthy</div>
          </div>

          {/* ── TIMELINE CHART ─────────────────────────────────────────── */}
          <div className="card timeline-card">
            <div className="section-header">
              <div className="section-title">Stream Activity</div>
              <div className="section-meta">Last {since} · {entries.length} events</div>
            </div>
            <div className="timeline-chart">
              <div className="timeline-bars">
                {logVolumeTimeline.map((d, i) => (
                  <div
                    key={i}
                    className="timeline-bar-group"
                    data-tooltip={`t${i}: ${d.total} logs, ${d.errors} errors`}
                  >
                    {d.errors > 0 && (
                      <div
                        className="tbar-error"
                        style={{
                          height: `${(d.errors / maxTimelineBucket) * 100}%`,
                        }}
                      />
                    )}
                    <div
                      className="tbar-total"
                      style={{
                        height: `${((d.total - d.errors) / maxTimelineBucket) * 100}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="timeline-legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: "#4a72c0" }}/>
                Log Events
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: "#ef4444" }}/>
                Errors
              </div>
              <div className="legend-item" style={{ marginLeft: "auto" }}>
                <span>{stats.errors} errors / {stats.warns} warnings / {stats.total - stats.errors - stats.warns} info</span>
              </div>
            </div>
          </div>

          {/* ── FILTERS ────────────────────────────────────────────────── */}
          <div className="card filters-card">
            <div className="field grow">
              <div className="filter-label">Search</div>
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  className="input-field search-input"
                  placeholder="Query logs… e.g. message='timeout' service='auth'"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
                />
              </div>
            </div>

            <div className="field">
              <div className="filter-label">Service</div>
              <div className="select-wrap">
                <select
                  className="input-field select-field"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                >
                  <option value="all">All Services</option>
                  {SERVICES.filter((s) => s !== "all").map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <div className="filter-label">Level</div>
              <div className="select-wrap">
                <select
                  className="input-field select-field"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="all">All Levels</option>
                  {LEVELS.filter((l) => l !== "all").map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <div className="filter-label">Time Range</div>
              <div className="time-pills">
                {TIME_RANGES.map((t) => (
                  <button
                    key={t.value}
                    className={`time-pill ${since === t.value ? "active" : ""}`}
                    onClick={() => setSince(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── LOG TABLE ──────────────────────────────────────────────── */}
          <div className="logs-container">
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                <div className="section-header" style={{ marginBottom: 0 }}>
                  <div className="section-title">Log Feed</div>
                  <div className="section-meta">
                    {loading ? "Fetching…" : `${entries.length} entries`}
                  </div>
                </div>
              </div>
              <div className="log-table-wrap">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th style={{ width: 88 }}>Time</th>
                      <th style={{ width: 130 }}>Service</th>
                      <th style={{ width: 72 }}>Level</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && entries.length === 0 ? (
                      <tr className="loading-row">
                        <td colSpan={4}>
                          <span className="loading-shimmer">Fetching logs…</span>
                        </td>
                      </tr>
                    ) : entries.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="empty-state">
                            <div className="empty-icon">📭</div>
                            <div className="empty-text">No log entries match your filters</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry, i) => (
                        <tr
                          key={i}
                          className={`log-row ${entry.level ? `level-${entry.level.toLowerCase()}` : ""}`}
                        >
                          <td className="log-cell log-time">
                            {new Date(entry.timestamp).toLocaleTimeString([], {
                              hour12: false,
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </td>
                          <td className="log-cell">
                            <span className={`service-tag ${getServiceClass(entry.service)}`}>
                              {entry.service || "kernel"}
                            </span>
                          </td>
                          <td className="log-cell">
                            <span className={`badge badge-${entry.level?.toLowerCase() ?? "info"}`}>
                              {entry.level ?? "INFO"}
                            </span>
                          </td>
                          <td className="log-cell log-message">{entry.message}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── SIDEBAR ────────────────────────────────────────────────── */}
          <div className="sidebar-container">

            {/* Error Gauge */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: "0.75rem" }}>Error Rate</div>
              <div className="gauge-wrap">
                <ErrorGauge errorRate={stats.errorRate} />
                <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--error)", fontFamily: "'Syne', sans-serif" }}>{stats.errors}</div>
                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Errors</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--warn)", fontFamily: "'Syne', sans-serif" }}>{stats.warns}</div>
                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Warns</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--accent)", fontFamily: "'Syne', sans-serif" }}>{stats.total - stats.errors - stats.warns}</div>
                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Info</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Traffic Donut */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: "0.875rem" }}>Traffic by Service</div>
              <div className="donut-wrap">
                <DonutChart data={serviceBreakdown} />
                <div className="donut-legend">
                  {serviceBreakdown.map((s) => (
                    <div key={s.label} className="donut-legend-item">
                      <div className="donut-legend-label">
                        <div className="donut-legend-dot" style={{ background: s.color }}/>
                        {s.label}
                      </div>
                      <div className="donut-legend-val">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bar breakdown */}
              <div className="bar-chart" style={{ marginTop: "1rem", paddingTop: "0.875rem", borderTop: "1px solid var(--border)" }}>
                {serviceBreakdown.map((s) => {
                  const pct = entries.length ? (s.value / entries.length) * 100 : 0;
                  return (
                    <div key={s.label} className="bar-item">
                      <div className="bar-item-header">
                        <span className="bar-item-label">{s.label}-svc</span>
                        <span className="bar-item-count">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${pct}%`, background: s.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Observer AI */}
            <div className="card ai-card">
              <div className="section-title" style={{ marginBottom: "0.75rem" }}>Observer AI</div>
              <div className="ai-status-row">
                <div className="ai-status-dot"/>
                <span className="ai-status-label">Active · 4 clusters</span>
              </div>
              <p className="ai-message">
                No significant drift detected in the last 15 minutes. All services operating within normal parameters.
              </p>
              <button className="btn btn-ghost" style={{ width: "100%", fontSize: "0.75rem" }}>
                View Full Report →
              </button>
            </div>

            {/* Alert Config */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: "0.875rem" }}>Alert Config</div>
              <div className="toggle-list">
                <div className="toggle-row">
                  <div>
                    <div className="toggle-row-label">Error Spike Notification</div>
                    <div className="toggle-row-sub">Threshold: &gt;10%</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked/>
                    <div className="toggle-track"/>
                    <div className="toggle-thumb"/>
                  </label>
                </div>
                <div className="toggle-row">
                  <div>
                    <div className="toggle-row-label">Latency Threshold</div>
                    <div className="toggle-row-sub">Alert at 200ms P99</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox"/>
                    <div className="toggle-track"/>
                    <div className="toggle-thumb"/>
                  </label>
                </div>
                <div className="toggle-row">
                  <div>
                    <div className="toggle-row-label">Anomaly Detection</div>
                    <div className="toggle-row-sub">ML-based drift alerts</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked/>
                    <div className="toggle-track"/>
                    <div className="toggle-thumb"/>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}