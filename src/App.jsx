import { useEffect, useMemo, useState } from 'react';

const KEY = 'shift-tracker-v1';
const DEFAULTS = { shiftHours: '8', completed: '00:00', startTime: '', use24Hour: false };
const dateKey = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

function loadToday() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.date === dateKey()) return { ...DEFAULTS, ...saved.values };
    localStorage.removeItem(KEY);
  } catch { localStorage.removeItem(KEY); }
  return DEFAULTS;
}

function durationMinutes(value) {
  const match = /^\s*(\d{1,3})\s*[:.]\s*(\d{1,2})\s*$/.exec(value);
  if (!match || Number(match[2]) > 59) throw new Error('Enter completed time as HH:MM, with minutes from 00 to 59.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function clockMinutes(value, use24) {
  const match = /^\s*(\d{1,2})\s*[:.]\s*(\d{1,2})\s*(AM|PM)?\s*$/i.exec(value);
  if (!match || Number(match[2]) > 59) throw new Error('Enter a valid start time.');
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (use24) {
    if (suffix || hours > 23) throw new Error('Use 24-hour time, e.g. 15:30.');
  } else {
    if (hours < 1 || hours > 12) throw new Error('Use a 1–12 hour time and AM/PM.');
    if (suffix === 'AM') hours = hours === 12 ? 0 : hours;
    else if (suffix === 'PM') hours = hours === 12 ? 12 : hours + 12;
    else throw new Error('Include AM or PM, or enable 24-hour mode.');
  }
  return hours * 60 + minutes;
}

function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
}

export default function App() {
  const [form, setForm] = useState(loadToday);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);

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
      if (completed > total) throw new Error('Completed time cannot exceed the shift length.');
      const remaining = total - completed;
      const end = new Date(now);
      if (form.startTime.trim()) {
        const start = clockMinutes(form.startTime, form.use24Hour);
        end.setHours(Math.floor(start / 60), start % 60, 0, 0);
        end.setTime(end.getTime() + total * 60000);
      } else {
        end.setTime(now + remaining * 60000);
      }
      return { remaining, completed, end, seconds: Math.max(0, Math.floor((end.getTime() - now) / 1000)) };
    } catch (error) { return { error: error.message }; }
  }, [form, now]);

  useEffect(() => {
    if (result.error) { setSaved(false); return; }
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
        <label>Time already worked <small>(HH:MM)</small>
          <input value={form.completed} onChange={e => update('completed', e.target.value)} placeholder="e.g. 02:45" inputMode="decimal" />
          <small>Enter completed hours and minutes.</small>
        </label>
        <label>Shift start time <small>(optional)</small>
          <input value={form.startTime} onChange={e => update('startTime', e.target.value)} placeholder={form.use24Hour ? 'e.g. 09:30' : 'e.g. 09:30 AM'} />
          <small>Leave blank to count the remaining duration from now.</small>
        </label>
        <label className="toggle"><span>24-hour clock <small>Use 00:00–23:59</small></span><input type="checkbox" checked={form.use24Hour} onChange={e => update('use24Hour', e.target.checked)} /></label>
        {message && <p className="error" role="alert">{message}</p>}
        {result.error && !message && <p className="hint">{result.error}</p>}
        <div className="buttons"><button className="primary" type="submit">Save today’s entry</button><button className="secondary" type="button" onClick={reset}>Reset</button></div>
        <p className="privacy">{saved ? 'Saved on this device. It expires at local midnight.' : 'Saved entries stay on this device for today and expire at local midnight.'}</p>
      </form>
      <section className="result" aria-live="polite">
        <p className="eyebrow">TIME REMAINING</p>
        <h2>{result.error ? '--:--:--' : duration(result.seconds)}</h2>
        <p>until your estimated shift end</p>
        <div><span>Estimated end</span><strong>{result.error ? '—' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(form.use24Hour ? { hourCycle: 'h23' } : {}) }).format(result.end)}</strong></div>
        <div><span>Completed</span><strong>{result.error ? '—' : Math.floor(result.completed / 60) + 'h ' + result.completed % 60 + 'm'}</strong></div>
      </section>
      <aside className="keka">
        <p className="eyebrow">KEKA INTEGRATION</p>
        <h2>Automatic attendance data</h2>
        <p>Keka sync needs your employer’s API access and a secure server-side connection. Keep API keys and credentials out of browser code.</p>
        <span>Not connected</span>
      </aside>
    </section>
    <footer>Local-first · No account required · Your time stays private</footer>
  </main>;
}
