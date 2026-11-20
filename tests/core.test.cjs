const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
test('45-minute timer resumes from its absolute end after closing and reopening', () => {
  const start = new Date('2026-11-20T12:00:00+09:00').getTime();
  const saved = JSON.stringify({ startedAt: new Date(start).toISOString(), endsAt: start + 45 * 60000 });
  const restored = JSON.parse(saved);
  assert.deepEqual(C.timerStatus(restored, start + 27 * 60000), { state: 'running', minutes: 18 });
  assert.deepEqual(C.timerStatus(restored, start + 45 * 60000), { state: 'ready', minutes: 0 });
  assert.deepEqual(C.timerStatus({ ...restored, hungAt: new Date(start + 46 * 60000).toISOString() }, start), { state: 'done', minutes: 0 });
});
test('medication records the actual check timestamp and undo removes only that check', () => {
  const key = C.doseKey('med', '2026-11-20', '20:00');
  const original = { another: '2026-11-19T12:00:00.000Z' };
  const checked = C.recordDose(original, key, '2026-11-20T21:10:00+09:00');
  assert.equal(checked[key], '2026-11-20T12:10:00.000Z');
  assert.deepEqual(C.undoDose(checked, key), original);
  assert.deepEqual(original, { another: '2026-11-19T12:00:00.000Z' });
});
test('editing an expense updates its weekly total, including when moved outside the week', () => {
  const now = new Date(2026, 10, 20, 14);
  const rows = [{ id: 'a', amount: 4500, at: new Date(2026, 10, 20, 14).toISOString() }, { id: 'b', amount: 33500, at: new Date(2026, 10, 16, 10).toISOString() }, { id: 'c', amount: 999, at: new Date(2026, 10, 23, 0).toISOString() }];
  assert.equal(C.weeklyTotal(rows, now), 38000);
  assert.equal(C.weeklyTotal(rows.map(x => x.id === 'a' ? { ...x, amount: 6500 } : x), now), 40000);
  assert.equal(C.weeklyTotal(rows.map(x => x.id === 'a' ? { ...x, at: new Date(2026, 10, 15, 23, 59).toISOString() } : x), now), 33500);
  assert.deepEqual(C.weekRange(new Date(2026, 10, 22)), { start: '2026-11-16', end: '2026-11-23' });
});
test('existing medication days, date range and check keys are honored', () => {
  const med = { id: 'old', name: '저녁', times: ['21:00', '21:00'], days: [5], startDate: '2026-11-01', endDate: '2026-11-30' };
  const checkedAt = '2026-11-20T12:10:00.000Z';
  assert.equal(C.doses([med], { 'old|2026-11-20|21:00': checkedAt }, new Date(2026, 10, 20))[0].checkedAt, checkedAt);
  assert.equal(C.doses([med], {}, new Date(2026, 10, 21)).length, 0);
  assert.equal(C.doses([med], {}, new Date(2026, 11, 4)).length, 0);
});
test('migration preserves original objects and imports only actual recorded amounts', () => {
  const records = [{ id: 'old', kind: 'clothes', name: '옷', amount: '12000', date: '2026-11-20' }, { id: 'no', kind: 'shopping', name: '장보기', date: '2026-11-20' }];
  const snapshot = JSON.stringify(records);
  const state = C.initialState([], {}, records);
  assert.equal(state.expenses.length, 1);
  assert.equal(state.expenses[0].amount, 12000);
  assert.equal(state.expenses[0].dateOnly, true);
  assert.equal(JSON.stringify(records), snapshot);
  assert.equal(C.parseAmount('4,500'), 4500);
  for (const value of ['-1', '0', '3.5', 'abc', 'Infinity']) assert.equal(C.parseAmount(value), null);
});
