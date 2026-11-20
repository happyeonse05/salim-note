(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SalimCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const day = value => {
    if (typeof value === 'boolean' || value === null || value === undefined) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function weekRange(now = new Date()) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return { start: day(start), end: day(end) };
  }
  function weeklyTotal(expenses, now = new Date()) {
    const { start, end } = weekRange(now);
    return expenses.reduce((sum, item) => {
      const date = day(item.at);
      return date >= start && date < end && Number.isSafeInteger(item.amount) && item.amount > 0 ? sum + item.amount : sum;
    }, 0);
  }
  function timerStatus(timer, now = Date.now()) {
    if (timer.hungAt) return { state: 'done', minutes: 0 };
    if (timer.cancelledAt) return { state: 'cancelled', minutes: 0 };
    const left = Number(timer.endsAt) - Number(now);
    return { state: left > 0 ? 'running' : 'ready', minutes: Math.max(0, Math.ceil(left / 60000)) };
  }
  const doseKey = (id, date, time) => `${id}|${date}|${time}`;
  function doses(medicines, checks, now = new Date()) {
    const date = day(now), weekday = now.getDay();
    return medicines.filter(m => m && Array.isArray(m.times) && (!Array.isArray(m.days) || m.days.includes(weekday)) && (!m.startDate || m.startDate <= date) && (!m.endDate || m.endDate >= date))
      .flatMap(med => [...new Set(med.times)].filter(time => /^\d{2}:\d{2}$/.test(time)).map(time => {
        const key = doseKey(med.id, date, time);
        return { med, time, key, checkedAt: checks[key] || null };
      })).sort((a, b) => a.time.localeCompare(b.time));
  }
  function recordDose(checks, key, at) { return { ...checks, [key]: new Date(at).toISOString() }; }
  function undoDose(checks, key) { const copy = { ...checks }; delete copy[key]; return copy; }
  function parseAmount(value) {
    const clean = String(value).trim().replaceAll(',', '');
    if (!/^\d{1,9}$/.test(clean)) return null;
    const amount = Number(clean); return amount > 0 && Number.isSafeInteger(amount) ? amount : null;
  }
  function initialState(medicines = [], checks = {}, records = []) {
    const expenses = records.filter(r => r && r.kind === 'clothes' && parseAmount(r.amount) && /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''))
      .map(r => ({ id: `previous:${r.id}`, amount: parseAmount(r.amount), note: r.name || '', at: new Date(`${r.date}T12:00:00`).toISOString(), dateOnly: true, sourceId: r.id }));
    return { version: 1, timers: [], expenses, medicines: Array.isArray(medicines) ? medicines : [], checks: checks && !Array.isArray(checks) && typeof checks === 'object' ? checks : {}, budget: null, notifyMeds: {}, notified: {} };
  }
  return { day, weekRange, weeklyTotal, timerStatus, doseKey, doses, recordDose, undoDose, parseAmount, initialState };
});
