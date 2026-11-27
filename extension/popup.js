const STORE_KEY = "remaining-time-extension-v1";
const $ = (id) => document.getElementById(id);
let settings = null;
let tickHandle = null;

const pad = (n) => String(n).padStart(2, "0");
const todayKey = (date = new Date()) => [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
const timeNow = (date = new Date()) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const duration = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  return [Math.floor(safe / 3600), Math.floor((safe % 3600) / 60), safe % 60].map(pad).join(":");
};
const clock = (date) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);

function parseCompleted(value) {
  const match = /^\s*(\d{1,3})\s*[:.]\s*(\d{1,2})\s*$/.exec(value);
  if (!match || Number(match[2]) > 59) throw new Error("Enter worked time as HH:MM (minutes 00–59).");
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 720) throw new Error("Worked time cannot exceed 12 hours.");
  return minutes;
}

function currentSettings() {
  const now = new Date();
  return { date: todayKey(now), shiftHours: "8", startTime: timeNow(now), completed: "00:00" };
}

function validate(value) {
  const hours = Number(value.shiftHours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 12) throw new Error("Choose a shift length from 1 to 12 hours.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime)) throw new Error("Choose a valid shift start time.");
  const completed = parseCompleted(value.completed);
  if (completed > hours * 60) throw new Error("Worked time cannot exceed the selected shift length.");
  return { ...value, completedMinutes: completed };
}

function endFor(value) {
  const [hour, minute] = value.startTime.split(":").map(Number);
  const start = new Date();
  start.setHours(hour, minute, 0, 0);
  return new Date(start.getTime() + Math.max(0, Number(value.shiftHours) * 60 - value.completedMinutes) * 60000);
}

function render() {
  const now = new Date();
  $("today").textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(now);
  if (!settings || settings.date !== todayKey(now)) settings = currentSettings();
  let value;
  try { value = validate(settings); }
  catch (error) {
    $("error").hidden = false;
    $("error").textContent = error.message;
    $("remaining").textContent = "--:--:--";
    $("status").textContent = "Check your shift settings";
    $("progress").style.width = "0%";
    return;
  }
  $("error").hidden = true;
  const end = endFor(value);
  const seconds = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  const totalSeconds = Number(value.shiftHours) * 3600;
  const elapsedSeconds = Math.max(0, totalSeconds - seconds);
  const progress = Math.min(100, Math.max(0, elapsedSeconds / totalSeconds * 100));
  $("remaining").textContent = duration(seconds);
  $("status").textContent = seconds === 0 ? "Shift complete — time to unwind!" : "Until your estimated shift end";
  $("elapsed").textContent = duration(elapsedSeconds);
  $("end-time").textContent = clock(end);
  $("progress").style.width = `${progress}%`;
}

async function persist() {
  settings.date = todayKey();
  await chrome.storage.local.set({ [STORE_KEY]: settings });
  render();
}

async function init() {
  const stored = await chrome.storage.local.get(STORE_KEY);
  settings = stored[STORE_KEY]?.date === todayKey() ? stored[STORE_KEY] : currentSettings();
  $("shift-hours").value = settings.shiftHours;
  $("start-time").value = settings.startTime;
  $("completed").value = settings.completed;
  $("settings").addEventListener("submit", async (event) => {
    event.preventDefault();
    settings = { date: todayKey(), shiftHours: $("shift-hours").value, startTime: $("start-time").value, completed: $("completed").value };
    try { validate(settings); await persist(); }
    catch (error) { $("error").hidden = false; $("error").textContent = error.message; }
  });
  $("reset").addEventListener("click", async () => {
    settings = currentSettings();
    $("shift-hours").value = settings.shiftHours;
    $("start-time").value = settings.startTime;
    $("completed").value = settings.completed;
    await persist();
  });
  render();
  tickHandle = window.setInterval(render, 1000);
}
window.addEventListener("unload", () => { if (tickHandle) window.clearInterval(tickHandle); });
init().catch((error) => {
  $("error").hidden = false;
  $("error").textContent = "Could not load saved settings. Please reload the extension.";
  console.error(error);
});
