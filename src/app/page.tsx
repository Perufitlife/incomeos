'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

type Period = 'day' | 'month' | 'year';

type SourceRow = {
  id: string; number: number | null; name: string; slug: string;
  category: string; connector: string; status: string;
  emoji: string | null; color: string | null; notes: string | null; link: string | null;
  monthly: Record<string, number>; daily: Record<string, number>;
  year: number; all: number; spark: number[];
};
type Goal = { id: string; name: string; period: 'month' | 'year'; target_usd: number; scope: string };
type Data = {
  today: string; currentMonth: string; currentYear: string;
  months: string[];
  sources: SourceRow[];
  monthTotals: Record<string, number>;
  monthlySeries: { month: string; usd: number }[];
  dailySeries: { date: string; usd: number }[];
  totals: { year: number; all: number };
  goals: Goal[];
  syncs: { connector: string; ok: boolean; ran_at: string; total_usd: number; error: string | null }[];
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmt = (n: number) => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// positive money is green; zero is muted gray (so empty sources don't scream green)
const amtColor = (n: number) => (n > 0 ? 'var(--money)' : 'var(--mut)');
const fmtShort = (n: number) => n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + Math.round(n);
const monthLabel = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);

function daysInMonth(ym: string) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function dayBasis(ym: string, currentMonth: string, today: string) {
  return ym === currentMonth ? Math.max(1, Number(today.slice(8, 10))) : daysInMonth(ym);
}

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [sel, setSel] = useState<string>(''); // selected YYYY-MM
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [modal, setModal] = useState<null | 'source' | 'monthly' | 'goal'>(null);
  const [editSrc, setEditSrc] = useState<SourceRow | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { const t = localStorage.getItem('io_token'); if (t) setToken(t); }, []);

  const fetchData = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const r = await fetch('/api/data', { headers: { Authorization: 'Bearer ' + tok } });
      if (r.status === 401) { localStorage.removeItem('io_token'); setToken(null); setAuthErr('Clave inválida'); return; }
      const j = await r.json();
      setData(j);
      setSel((prev) => prev || j.currentMonth);
      setLastFetch(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchData(token);
    const id = setInterval(() => fetchData(token), 60000);
    return () => clearInterval(id);
  }, [token, fetchData]);

  async function doLogin() {
    setAuthErr('');
    const r = await fetch('/api/data', { headers: { Authorization: 'Bearer ' + pass } });
    if (r.ok) { localStorage.setItem('io_token', pass); setToken(pass); }
    else setAuthErr('Clave incorrecta');
  }

  async function doSync() {
    if (!token) return;
    setSyncing(true);
    try { await fetch('/api/sync', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); await fetchData(token); }
    finally { setSyncing(false); }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card fade p-8 w-full max-w-sm">
          <div className="text-2xl font-extrabold mb-1">💰 IncomeOS</div>
          <p className="muted text-sm mb-5">Tu panel de ingresos pasivos.</p>
          <input className="input mb-3" type="password" placeholder="Clave de acceso"
            value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} />
          <button className="btn w-full justify-center" onClick={doLogin}>Entrar</button>
          {authErr && <p className="text-sm mt-3" style={{ color: 'var(--red)' }}>{authErr}</p>}
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 pb-24 w-full">
      <Header data={data} loading={loading} lastFetch={lastFetch} onSync={doSync} syncing={syncing}
        onLogout={() => { localStorage.removeItem('io_token'); setToken(null); setData(null); }} />
      {!data || !sel ? (
        <div className="muted mt-20 text-center">Cargando…</div>
      ) : (
        <>
          <div className={'grid gap-4 mb-4 ' + (data.goals.length ? 'lg:grid-cols-3' : '')}>
            <div className={data.goals.length ? 'lg:col-span-2' : ''}>
              <Hero data={data} period={period} setPeriod={setPeriod} sel={sel} setSel={setSel} />
            </div>
            {data.goals.length > 0 && <div className="lg:col-span-1"><Goals data={data} sel={sel} /></div>}
          </div>
          <Trend data={data} period={period} sel={sel} setSel={setSel} />
          <Sources data={data} period={period} sel={sel} onEdit={setEditSrc} />
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn sm" onClick={() => setModal('monthly')}>💵 Registrar ingreso del mes</button>
            <button className="btn ghost sm" onClick={() => setModal('source')}>➕ Agregar fuente</button>
            <button className="btn ghost sm" onClick={() => setModal('goal')}>🎯 Nueva meta</button>
          </div>
          <SyncStatus syncs={data.syncs} />
        </>
      )}
      {modal === 'source' && <SourceModal token={token} onClose={() => setModal(null)} onDone={() => { setModal(null); fetchData(token); }} />}
      {modal === 'monthly' && data && <MonthlyModal token={token} data={data} sel={sel} onDone={() => fetchData(token)} onClosed={() => setModal(null)} />}
      {modal === 'goal' && data && <GoalModal token={token} sources={data.sources} onClose={() => setModal(null)} onDone={() => { setModal(null); fetchData(token); }} />}
      {editSrc && <EditSourceModal token={token} src={editSrc} onClose={() => setEditSrc(null)} onDone={() => { setEditSrc(null); fetchData(token); }} />}
    </main>
  );
}

/* ---- helpers to compute the value of a source for the active scope ---- */
function sourceValue(s: SourceRow, period: Period, sel: string, data: Data): number {
  if (period === 'year') return s.year;
  const m = s.monthly[sel] || 0;
  if (period === 'month') return m;
  return m / dayBasis(sel, data.currentMonth, data.today); // day = average/day
}
function totalValue(period: Period, sel: string, data: Data): number {
  if (period === 'year') return data.totals.year;
  const m = data.monthTotals[sel] || 0;
  if (period === 'month') return m;
  return m / dayBasis(sel, data.currentMonth, data.today);
}

function Header({ data, loading, lastFetch, onSync, syncing, onLogout }: {
  data: Data | null; loading: boolean; lastFetch: Date | null; onSync: () => void; syncing: boolean; onLogout: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 22 }}>💰</span>
        <span className="font-extrabold text-xl">IncomeOS</span>
        <span className="pill ml-1">{data?.sources.filter((s) => s.status === 'active').length ?? 0} activas</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="muted text-xs hidden sm:inline">{lastFetch ? 'Act. ' + lastFetch.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}{loading ? ' · …' : ''}</span>
        <button className="btn ghost sm" onClick={onSync} disabled={syncing}>{syncing ? '⟳ …' : '⟳ Sincronizar'}</button>
        <button className="btn ghost sm" onClick={onLogout}>Salir</button>
      </div>
    </div>
  );
}

function Hero({ data, period, setPeriod, sel, setSel }: {
  data: Data; period: Period; setPeriod: (p: Period) => void; sel: string; setSel: (m: string) => void;
}) {
  const value = totalValue(period, sel, data);
  const basis = dayBasis(sel, data.currentMonth, data.today);
  const monthsElapsed = Number(data.currentMonth.slice(5, 7));
  const monthTot = data.monthTotals[sel] || 0;
  const label = period === 'day' ? `Promedio por día · ${monthLabel(sel)}`
    : period === 'month' ? `Total · ${monthLabel(sel)}`
      : `Total · ${data.currentYear}`;

  const idx = data.months.indexOf(sel);
  const move = (d: number) => { const i = idx + d; if (i >= 0 && i < data.months.length) setSel(data.months[i]); };

  return (
    <div className="card fade p-6 h-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="muted text-sm mb-1">{label}</div>
          <div className="font-extrabold tabular" style={{ fontSize: 52, lineHeight: 1, letterSpacing: -1, color: amtColor(value) }}>{fmt(value)}</div>
          <div className="flex gap-5 mt-3 text-sm flex-wrap">
            <Mini label="Prom/día" v={monthTot / basis} on={period === 'day'} />
            <Mini label={'Mes (' + MESES[Number(sel.slice(5, 7)) - 1] + ')'} v={monthTot} on={period === 'month'} />
            <Mini label="Prom/mes" v={data.totals.year / Math.max(1, monthsElapsed)} on={false} />
            <Mini label={'Año ' + data.currentYear} v={data.totals.year} on={period === 'year'} />
            <Mini label="Histórico" v={data.totals.all} on={false} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="seg">
            <button className={period === 'day' ? 'on' : ''} onClick={() => setPeriod('day')}>Día</button>
            <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>Mes</button>
            <button className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>Año</button>
          </div>
          {period !== 'year' && (
            <div className="flex items-center gap-2">
              <button className="btn ghost sm" disabled={idx <= 0} onClick={() => move(-1)}>←</button>
              <span className="font-bold text-sm" style={{ minWidth: 92, textAlign: 'center' }}>{monthLabel(sel)}</span>
              <button className="btn ghost sm" disabled={idx >= data.months.length - 1} onClick={() => move(1)}>→</button>
            </div>
          )}
        </div>
      </div>
      {period === 'day' && (
        <div className="muted text-xs mt-3">
          Promedio = total del mes ÷ {basis} día{basis > 1 ? 's' : ''}{sel === data.currentMonth ? ' transcurridos' : ''}.
          Las fuentes mensuales se prorratean automáticamente.
        </div>
      )}
    </div>
  );
}

function Mini({ label, v, on }: { label: string; v: number; on: boolean }) {
  return (
    <div style={{ opacity: on ? 1 : 0.55 }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div className="font-bold tabular">{fmt(v)}</div>
    </div>
  );
}

function Goals({ data, sel }: { data: Data; sel: string }) {
  if (!data.goals.length) return null;
  return (
    <div className="card fade p-5 h-full">
      <div className="font-bold mb-3">🎯 Metas</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        {data.goals.map((g) => {
          let cur = 0;
          if (g.scope && g.scope !== 'all') {
            const s = data.sources.find((x) => x.slug === g.scope);
            cur = g.period === 'year' ? (s?.year || 0) : (s?.monthly[sel] || 0);
          } else {
            cur = g.period === 'year' ? data.totals.year : (data.monthTotals[sel] || 0);
          }
          const pct = Math.min(100, (cur / Number(g.target_usd)) * 100);
          const falta = Math.max(0, Number(g.target_usd) - cur);
          return (
            <div key={g.id}>
              <div className="flex justify-between text-sm mb-1">
                <span>{g.name} <span className="muted">({g.period === 'year' ? data.currentYear : MESES[Number(sel.slice(5, 7)) - 1]})</span></span>
                <span className="tabular font-bold">{Math.round(pct)}%</span>
              </div>
              <div style={{ height: 9, background: '#0a0e17', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: pct >= 100 ? 'var(--green)' : 'linear-gradient(90deg,var(--acc),var(--acc2))' }} />
              </div>
              <div className="muted text-xs mt-1 tabular">{fmt(cur)} / {fmt(g.target_usd)} · faltan {fmt(falta)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendTip({ active, payload }: { active?: boolean; payload?: { payload: { month: string; usd: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--bd)', borderRadius: 10, padding: '9px 12px', boxShadow: '0 10px 30px -12px rgba(0,0,0,.7)' }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 3 }}>{monthLabel(p.month)}</div>
      <div className="tabular font-bold" style={{ fontSize: 16, color: p.usd > 0 ? 'var(--money)' : 'var(--mut)' }}>{fmt(p.usd)}</div>
    </div>
  );
}

function Trend({ data, period, sel, setSel }: { data: Data; period: Period; sel: string; setSel: (m: string) => void }) {
  const series = data.monthlySeries.map((m) => ({ ...m, label: MESES[Number(m.month.slice(5, 7)) - 1] }));
  return (
    <div className="card fade p-5 mb-4">
      <div className="flex justify-between items-center mb-3">
        <div className="font-bold">📈 Tendencia mensual (últimos 12 meses)</div>
        <div className="muted text-xs">clic en una barra para ver ese mes</div>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
          onClick={(state) => {
            const i = state?.activeTooltipIndex;
            if (typeof i === 'number' && data.monthlySeries[i]) setSel(data.monthlySeries[i].month);
          }}>
          <XAxis dataKey="label" tick={{ fill: '#8d99b0', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#8d99b0', fontSize: 10 }} tickFormatter={fmtShort} width={44} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,.045)', radius: 5 }} content={<TrendTip />} />
          <Bar dataKey="usd" radius={[5, 5, 0, 0]}>
            {series.map((m) => (
              <Cell key={m.month} fill={m.month === sel && period !== 'year' ? '#34d399' : '#3b82f6'} cursor="pointer" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Sources({ data, period, sel, onEdit }: { data: Data; period: Period; sel: string; onEdit: (s: SourceRow) => void }) {
  const sorted = [...data.sources].sort((a, b) => sourceValue(b, period, sel, data) - sourceValue(a, period, sel, data) || (a.number ?? 99) - (b.number ?? 99));
  const scopeLabel = period === 'day' ? 'promedio/día' : period === 'month' ? monthLabel(sel) : 'año ' + data.currentYear;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-3 mt-6">
        <div className="font-bold">Fuentes · {scopeLabel}</div>
        <div className="muted text-xs">clic en una tarjeta abre su panel ↗</div>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
        {sorted.map((s) => <SourceCard key={s.id} s={s} period={period} sel={sel} data={data} onEdit={onEdit} />)}
      </div>
    </div>
  );
}

function SourceCard({ s, period, sel, data, onEdit }: { s: SourceRow; period: Period; sel: string; data: Data; onEdit: (s: SourceRow) => void }) {
  const v = sourceValue(s, period, sel, data);
  const statusCls = s.status === 'active' ? 'live' : s.status === 'pending' ? 'pending' : 'future';
  const statusTxt = s.status === 'active' ? 'activo' : s.status === 'pending' ? 'pendiente' : 'futuro';
  const open = () => { if (s.link) window.open(s.link, '_blank', 'noopener'); };
  return (
    <div className={'card fade p-4 flex flex-col gap-2 ' + (s.link ? 'clickable' : '')} onClick={open}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="muted text-xs font-bold">#{s.number ?? '–'}</span>
          <span style={{ fontSize: 18 }}>{s.emoji || '💸'}</span>
          <span className="font-bold truncate" title={s.name}>{s.name}</span>
        </div>
        <button className="iconbtn" title="Editar fuente / link" onClick={(e) => { e.stopPropagation(); onEdit(s); }}>✎</button>
      </div>
      <div className="tabular font-extrabold" style={{ fontSize: 26, color: amtColor(v) }}>{fmt(v)}</div>
      <Sparkline values={s.spark} color={v > 0 ? (s.color || '#34d399') : '#2a3140'} />
      <div className="flex justify-between items-center text-xs muted">
        <span className={'pill ' + statusCls}>{statusTxt}</span>
        <span>{s.link ? <span className="linkchip">abrir ↗</span> : connectorLabel(s.connector)}</span>
      </div>
    </div>
  );
}

function connectorLabel(c: string) {
  const m: Record<string, string> = {
    stripe: '⚡ Stripe auto', apify: '🔧 Apify', apify_affiliate: '🤝 Afiliado',
    youtube: '▶️ YouTube', amazon: '📦 Amazon', manual: '✍️ Manual',
  };
  return m[c] || c;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 100, h = 26, n = values.length;
  const bw = w / n;
  const hasData = values.some((v) => v > 0);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {hasData ? values.map((v, i) => {
        const bh = (v / max) * h;
        return <rect key={i} x={i * bw + 0.5} y={h - bh} width={bw - 1} height={bh} fill={color} opacity={0.85} rx={0.6} />;
      }) : <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="#232c40" strokeWidth={1} />}
    </svg>
  );
}

function SyncStatus({ syncs }: { syncs: Data['syncs'] }) {
  if (!syncs?.length) return null;
  const latest = new Map<string, Data['syncs'][0]>();
  for (const s of syncs) if (!latest.has(s.connector)) latest.set(s.connector, s);
  return (
    <div className="card p-4 mt-4">
      <div className="muted text-xs font-bold mb-2">Estado de conectores</div>
      <div className="flex flex-wrap gap-3 text-xs">
        {[...latest.values()].map((s) => (
          <span key={s.connector} className="flex items-center gap-1">
            <span style={{ color: s.ok ? 'var(--green)' : 'var(--red)' }}>●</span>
            <b>{s.connector}</b>
            <span className="muted">{new Date(s.ran_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            {s.error && <span style={{ color: 'var(--red)' }} title={s.error}>⚠</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Modals ---------- */
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal card p-6 fade" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="font-bold text-lg">{title}</div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
async function postManual(token: string, body: Record<string, unknown>) {
  const r = await fetch('/api/manual', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

function MonthlyModal({ token, data, sel, onDone, onClosed }: {
  token: string; data: Data; sel: string; onDone: () => void; onClosed: () => void;
}) {
  // default to first non-stripe source (Stripe is automatic)
  const manualSources = data.sources.filter((s) => s.connector !== 'stripe');
  const [sourceId, setSourceId] = useState((manualSources[0] || data.sources[0])?.id || '');
  const [month, setMonth] = useState(sel);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const src = data.sources.find((s) => s.id === sourceId);

  // existing series for the chosen source (last 12 months from data.months)
  const series = useMemo(() => data.months.map((m) => ({ m, v: src?.monthly[m] || 0 })), [src, data.months]);

  async function save() {
    setBusy(true);
    await postManual(token, { action: 'add_monthly', source_id: sourceId, month, amount_usd: amount === '' ? 0 : amount });
    setBusy(false); setAmount(''); onDone();
  }

  return (
    <ModalShell title="💵 Registrar ingreso del mes" onClose={() => { onClosed(); }}>
      <label className="muted text-sm">Fuente</label>
      <select className="input mb-3 mt-1" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
        {data.sources.map((s) => (
          <option key={s.id} value={s.id} disabled={s.connector === 'stripe'}>
            #{s.number} {s.emoji} {s.name}{s.connector === 'stripe' ? ' (automático)' : ''}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="muted text-sm">Mes</label>
          <input className="input mt-1" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div>
          <label className="muted text-sm">Monto del mes (USD)</label>
          <input className="input mt-1" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" onKeyDown={(e) => e.key === 'Enter' && amount && save()} />
        </div>
      </div>
      <button className="btn w-full justify-center mb-4" disabled={busy || !sourceId || amount === ''} onClick={save}>
        {busy ? 'Guardando…' : 'Guardar mes'}
      </button>

      {src && (
        <>
          <div className="muted text-xs font-bold mb-2">Historial de {src.emoji} {src.name}</div>
          <div className="flex flex-col gap-1" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {series.slice().reverse().map(({ m, v }) => (
              <button key={m} className="flex justify-between items-center text-sm px-2 py-1 rounded"
                style={{ background: m === month ? 'rgba(56,189,248,.12)' : 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg)' }}
                onClick={() => { setMonth(m); setAmount(v ? String(v) : ''); }}>
                <span className="muted">{monthLabel(m)}</span>
                <span className="tabular font-bold">{v ? fmt(v) : '—'}</span>
              </button>
            ))}
          </div>
          <div className="muted text-xs mt-2">Clic en un mes para editarlo. Pon 0 para borrarlo.</div>
        </>
      )}
    </ModalShell>
  );
}

function SourceModal({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('affiliate');
  const [status, setStatus] = useState('active');
  const [emoji, setEmoji] = useState('💸');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <ModalShell title="➕ Nueva fuente de ingreso" onClose={onClose}>
      <label className="muted text-sm">Nombre</label>
      <input className="input mb-3 mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Kore Afiliado, Google Extension X" />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="muted text-sm">Categoría</label>
          <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="affiliate">Afiliado</option>
            <option value="saas">SaaS / Suscripción</option>
            <option value="marketplace">Marketplace</option>
            <option value="ads">Publicidad / Ads</option>
            <option value="service">Servicio</option>
            <option value="other">Otro</option>
          </select>
        </div>
        <div>
          <label className="muted text-sm">Estado</label>
          <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Activo</option>
            <option value="pending">Pendiente</option>
            <option value="future">Futuro</option>
          </select>
        </div>
      </div>
      <label className="muted text-sm">Emoji</label>
      <input className="input mb-3 mt-1" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
      <label className="muted text-sm">Link del panel (opcional) <span className="muted">— donde revisas las ganancias</span></label>
      <input className="input mb-4 mt-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
      <button className="btn w-full justify-center" disabled={busy || !name}
        onClick={async () => { setBusy(true); await postManual(token, { action: 'add_source', name, category, status, emoji, link, connector: 'manual' }); onDone(); }}>
        {busy ? 'Guardando…' : 'Crear fuente'}
      </button>
    </ModalShell>
  );
}

function EditSourceModal({ token, src, onClose, onDone }: { token: string; src: SourceRow; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(src.name);
  const [emoji, setEmoji] = useState(src.emoji || '💸');
  const [status, setStatus] = useState(src.status);
  const [link, setLink] = useState(src.link || '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await postManual(token, { action: 'update_source', id: src.id, name, emoji, status, link: link || null });
    onDone();
  }
  async function del() {
    if (!confirm('¿Borrar la fuente "' + src.name + '" y todos sus ingresos? No se puede deshacer.')) return;
    setBusy(true);
    await postManual(token, { action: 'delete_source', id: src.id });
    onDone();
  }
  return (
    <ModalShell title={'✎ Editar ' + (src.emoji || '') + ' ' + src.name} onClose={onClose}>
      <label className="muted text-sm">Nombre</label>
      <input className="input mb-3 mt-1" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="muted text-sm">Emoji</label>
          <input className="input mt-1" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
        </div>
        <div>
          <label className="muted text-sm">Estado</label>
          <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Activo</option>
            <option value="pending">Pendiente</option>
            <option value="future">Futuro</option>
          </select>
        </div>
      </div>
      <label className="muted text-sm">Link del panel <span className="muted">— se abre al clic en la tarjeta</span></label>
      <input className="input mb-4 mt-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
      <div className="flex gap-2">
        <button className="btn flex-1 justify-center" disabled={busy || !name} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button className="btn ghost sm" style={{ color: 'var(--red)' }} onClick={del} disabled={busy}>Borrar</button>
      </div>
    </ModalShell>
  );
}

function GoalModal({ token, sources, onClose, onDone }: { token: string; sources: SourceRow[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [periodG, setPeriodG] = useState('month');
  const [scope, setScope] = useState('all');
  const [busy, setBusy] = useState(false);
  return (
    <ModalShell title="🎯 Nueva meta" onClose={onClose}>
      <label className="muted text-sm">Nombre</label>
      <input className="input mb-3 mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: $1,000/mes pasivo" />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="muted text-sm">Meta (USD)</label>
          <input className="input mt-1" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1000" />
        </div>
        <div>
          <label className="muted text-sm">Periodo</label>
          <select className="input mt-1" value={periodG} onChange={(e) => setPeriodG(e.target.value)}>
            <option value="month">Mensual</option>
            <option value="year">Anual</option>
          </select>
        </div>
      </div>
      <label className="muted text-sm">Aplica a</label>
      <select className="input mb-4 mt-1" value={scope} onChange={(e) => setScope(e.target.value)}>
        <option value="all">Todas las fuentes</option>
        {sources.map((s) => <option key={s.id} value={s.slug}>{s.emoji} {s.name}</option>)}
      </select>
      <button className="btn w-full justify-center" disabled={busy || !name || !target}
        onClick={async () => { setBusy(true); await postManual(token, { action: 'add_goal', name, target_usd: target, period: periodG, scope }); onDone(); }}>
        {busy ? 'Guardando…' : 'Crear meta'}
      </button>
    </ModalShell>
  );
}
