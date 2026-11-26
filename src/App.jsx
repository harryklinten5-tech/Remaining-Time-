import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const KEY = 'shift-tracker-v1';
const KEKA_API_URL = (import.meta.env.VITE_KEKA_API_URL || '').replace(/\\/+$/, '');
const KEKA_STATUS_KEY = ['keka', 'status'];
const dateKey = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const currentDefaults = () => {
  const now = new Date();
  return { shiftHours: '8', completed: '00:00', startDate: dateKey(now), startTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') };
};
const DEFAULTS = currentDefaults();

async function kekaRequest(path, options = {}) {
  const response = await fetch(`${KEKA_API_URL}${path}`, { credentials: 'include', ...options });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Keka request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

function loadToday() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.date === dateKey()) return { ...DEFAULTS, ...saved.values };
    localStorage.removeItem(KEY);
  } catch { localStorage.removeItem(KEY); }
  return DEFAULTS;
}

function TimeEntry({ value, onChange }) {
  return <input type="time" step="60" value={value} onChange={event => onChange(event.target.value)} />;
}

function durationMinutes(value) {
  const match = /^\\s*(\\d{1,3})\\s*[:.]\\s*(\\d{1,2})\\s*$/.exec(value);
  if (!match || Number(match[2]) > 59) throw new Error('Enter completed time as HH:MM, with minutes from 00 to 59.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseClock(value) {
  const match = /^\\s*(\\d{1,2}):(\\d{2})\\s*(AM|PM)?\\s*$/i.exec(value);
  if (!match) throw new Error('Enter a time like 2:30 PM or 14:30.');
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59) throw new Error('Minutes must be between 00 and 59.');
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error('For AM/PM times, enter an hour from 1 to 12.');
    hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  } else if (hour > 23) {
    throw new Error('For 24-hour time, enter an hour from 00 to 23.');
  }
  return { hour, minute };
}

function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
}

function formatTime(date, hour12) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12 }).format(date);
}

export default function App() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(loadToday);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const kekaStatusQuery = useQuery({
    queryKey: KEKA_STATUS_KEY,
    queryFn: () => kekaRequest('/api/keka/status'),
    enabled: Boolean(KEKA_API_URL),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true
  });
  const disconnectKeka = useMutation({
    mutationFn: () => kekaRequest('/api/keka/disconnect', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData(KEKA_STATUS_KEY, { connected: false, connectedAt: null, accessTokenExpiresAt: null }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEKA_STATUS_KEY })
  });
  const kekaConnected = Boolean(kekaStatusQuery.data?.connected);
  const kekaLoading = Boolean(KEKA_API_URL) && kekaStatusQuery.isLoading;
  const kekaError = kekaStatusQuery.error?.message || disconnectKeka.error?.message || '';

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      try {
        const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (stored?.date && stored.date !== dateKey()) {
          localStorage.removeItem(KEY);
          setForm(DEFAULTS);
          setSaved(false);
        }
      } catch { localStorage.removeItem(KEY); }
    };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);

  const result = useMemo(() => {
    try {
      const total = Number(form.shiftHours) * 60;
      if (!Number.isInteger(total) || total < 60 || total > 720) throw new Error('Select a shift length from 1 to 12 hours.');
      const completed = durationMinutes(form.completed);
      const remaining = Math.max(0, total - completed);
      let start;
      if (!form.startDate && !form.startTime) {
        start = new Date(now);
      } else {
        if (!form.startDate || !form.startTime) throw new Error('Enter both the counting start date and time.');
        const { hour, minute } = parseClock(form.startTime);
        const [year, month, day] = form.startDate.split('-').map(Number);
        start = new Date(year, month - 1, day, hour, minute, 0, 0);
        if (Number.isNaN(start.getTime()) || start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
          throw new Error('Choose a valid start date.');
        }
      }
      const end = new Date(start.getTime() + remaining * 60000);
      return { remaining, completed, end, seconds: Math.max(0, Math.floor((end.getTime() - now) / 1000)) };
    } catch (error) { return { error: error.message }; }
  }, [form, now]);

  useEffect(() => {
    if (result.error) { setSaved(false); return; }
    if (JSON.stringify(form) === JSON.stringify(DEFAULTS)) {
      localStorage.removeItem(KEY);
      setSaved(false);
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: dateKey(), values: form }));
      setSaved(true);
    } catch { setSaved(false); }
  }, [form, result.error]);

  const update = (key, value) => { setForm(current => ({ ...current, [key]: value })); setSaved(false); setMessage(''); };
  const save = event => {
    event.preventDefault();
    if (result.error) { setMessage(result.error); return; }
    localStorage.setItem(KEY, JSON.stringify({ date: dateKey(), values: form }));
    setSaved(true);
    setMessage('');
  };
  const reset = () => { localStorage.removeItem(KEY); setForm(DEFAULTS); setSaved(false); setMessage(''); };

  return <main className="page">
    <section className="card">
      <header className="header">
        <div className="logo">⌛</div>
        <p className="eyebrow">WORKDAY COMPANION</p>
        <h1>Shift tracker</h1>
        <p className="subtitle">Know exactly how much of your workday is left.</p>
        <span className="date">{new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(now))}</span>
      </header>
      <form onSubmit={save}>
        <label>Total shift length
          <select value={form.shiftHours} onChange={e => update('shiftHours', e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={String(n)}>{n} {n === 1 ? 'hour' : 'hours'}</option>)}
          </select>
        </label>
        <label>Time already worked <small>(hours:minutes)</small>
          <input type="text" inputMode="numeric" placeholder="HH:MM" value={form.completed} onChange={e => update('completed', e.target.value)} />
          <small>Enter hours and minutes in 24-hour style (for example, 08:30). No AM/PM needed.</small>
        </label>
        <label>Counting start date <small>(optional)</small>
          <input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} />
        </label>
        <label>Counting start time <small>(optional)</small>
          <TimeEntry value={form.startTime} onChange={value => update('startTime', value)} />
          <small>Use the same time picker as “Time already worked.” AM/PM appears when your device/browser uses a 12-hour clock. The date and time default to today and now; change either if needed.</small>
        </label>
        {message && <p className="error" role="alert">{message}</p>}
        {result.error && !message && <p className="hint">{result.error}</p>}
        <div className="buttons"><button className="primary" type="submit">Save today’s entry</button><button className="secondary" type="button" onClick={reset}>Reset</button></div>
        <p className="privacy">{saved ? 'Saved on this device. It expires at local midnight.' : 'Saved entries stay on this device for today and expire at local midnight.'}</p>
      </form>
      <section className="result" aria-live="polite">
        <p className="eyebrow">TIME REMAINING</p>
        <h2>{result.error ? '--:--:--' : duration(result.seconds)}</h2>
        <p>until your estimated shift end</p>
        <div><span>Estimated end (12-hour)</span><strong>{result.error ? '—' : formatTime(result.end, true)}</strong></div>
        <div><span>Estimated end (24-hour)</span><strong>{result.error ? '—' : formatTime(result.end, false)}</strong></div>
        <div><span>Completed</span><strong>{result.error ? '—' : Math.floor(result.completed / 60) + 'h ' + result.completed % 60 + 'm'}</strong></div>
      </section>
      <aside className="keka">
        <p className="eyebrow">THIRD-PARTY CONNECTION</p>
        <h2>Connect Keka</h2>
        <p>Connect your Keka account to bring your attendance data into Shift Tracker. You stay in control of the connection.</p>
        <span>{kekaLoading ? 'Checking connection…' : kekaConnected ? 'Connected' : 'Not connected'}</span>
        {!kekaConnected
          ? <button className="primary" type="button" disabled={!KEKA_API_URL || kekaBusy || kekaLoading} onClick={() => { setKekaBusy(true); window.location.assign(`${KEKA_API_URL}/api/keka/connect`); }}>{kekaBusy ? 'Opening Keka…' : 'Connect Keka'}</button>
          : <button className="primary" type="button" disabled={disconnectKeka.isPending} onClick={() => disconnectKeka.mutate()}>{disconnectKeka.isPending ? 'Disconnecting…' : 'Disconnect Keka'}</button>}
        {kekaError && <p className="error" role="alert">{kekaError}</p>}
        {!KEKA_API_URL && <p className="hint">The Keka backend URL is not configured for this deployment.</p>}
        <p className="hint">Sign in only on Keka’s official authorization page. Do not enter your Keka password or API key here.</p>
      </aside>
    </section>
    <footer>Local-first · No account required · Your time stays private</footer>
  </main>;
}
