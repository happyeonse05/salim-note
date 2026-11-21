const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../household-bridge.js');
const C = require('../core.js');
const KEY = 'oneul-salim-v1';
const RECORDS = 'salimnote-records-v1';
function storage(seed = {}) {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), json: k => JSON.parse(data.get(k)) };
}
function current() {
  return { ...C.initialState(), timers: [{ id: 'timer', minutes: 45, endsAt: 123 }], budget: 90000, cosmetics: [], extraField: 'keep' };
}
test('legacy basket and household records keep original storage formats without creating today state', () => {
  const old = { id: 'old', kind: 'food', name: '식품', expiryDate: '2026-12-31', photo: 'data:image/png;base64,fixture' };
  const s = storage({ [RECORDS]: [old] }); const b = create(s);
  b.save('shoppingList', [{ id: 'basket', name: '장보기 검증', done: true }]);
  b.saveRecords([...b.records(), { id: 'purchase', kind: 'shopping', name: '장보기', date: '2026-11-21' }]);
  assert.deepEqual(s.json(RECORDS)[0], old);
  assert.equal(s.json('salimnote-shopping-list-v1')[0].done, true);
  assert.equal(s.getItem(KEY), null);
});
test('medicine schedule and checks share today state while retaining care fields and timers', () => {
  const state = current(); state.medicines = [{ id: 'm', name: '검증', times: [], productId: 'fixture', mealNote: '메모', fastBeforeMinutes: 30 }];
  const legacy = [{ id: 'old', name: '옛 약', times: ['08:00'] }];
  const s = storage({ [KEY]: state, 'salimnote-medicines-v1': legacy }); const b = create(s);
  b.save('medicines', b.medicines().map(m => ({ ...m, dose: '사용자 입력', days: [1, 3], startDate: '2026-11-01', endDate: '2026-12-31' })));
  b.save('checks', { 'm|2026-11-21|08:00': '2026-11-21T00:01:00Z' });
  const result = s.json(KEY);
  assert.deepEqual(result.timers, state.timers); assert.equal(result.budget, 90000); assert.equal(result.extraField, 'keep');
  assert.equal(result.medicines[0].mealNote, '메모'); assert.equal(result.medicines[0].fastBeforeMinutes, 30);
  assert.deepEqual(result.medicines[0].times, []); assert.deepEqual(result.medicines[0].days, [1, 3]);
  assert.equal(Object.keys(result.checks).length, 1); assert.deepEqual(s.json('salimnote-medicines-v1'), legacy);
});
test('cosmetic edits retain legacy originals, finished state, photos and current ids', () => {
  const old = { id: 'c', kind: 'cosmetic', name: '원본', openedAt: '2026-01-31', paoMonths: 6, photo: 'data:fixture' };
  const state = current(); state.cosmetics = [{ ...old, id: 'legacy:c', name: '현재 수정', finishedAt: '2026-11-20T00:00:00Z' }];
  const s = storage({ [KEY]: state, [RECORDS]: [old] }); const b = create(s);
  assert.equal(b.records()[0].name, '현재 수정');
  b.saveRecords(b.records().map(x => ({ ...x, note: '사진 메모' })));
  assert.deepEqual(s.json(RECORDS), [old]);
  assert.equal(s.json(KEY).cosmetics[0].id, 'legacy:c');
  assert.equal(s.json(KEY).cosmetics[0].finishedAt, state.cosmetics[0].finishedAt);
  assert.equal(s.json(KEY).cosmetics[0].photo, 'data:fixture');
  b.saveRecords([]); assert.deepEqual(create(s).records(), []); assert.deepEqual(s.json(RECORDS), [old]);
});
test('clothing purchases appear once in expenses and explicit expense edits survive', () => {
  const state = current(); const s = storage({ [KEY]: state }); const b = create(s);
  const item = { id: 'clothes', kind: 'clothes', name: '옷 검증', date: '2026-11-21', amount: '35000' };
  b.saveRecords([item]); b.saveRecords([{ ...item, amount: '40000' }]);
  assert.equal(s.json(KEY).expenses.length, 1); assert.equal(s.json(KEY).expenses[0].amount, 40000);
  const updated = s.json(KEY); updated.expenses[0].amount = 30000; updated.expenses[0].updatedAt = 'edited'; s.setItem(KEY, JSON.stringify(updated));
  create(s).saveRecords([{ ...item, amount: '45000' }]); assert.equal(s.json(KEY).expenses[0].amount, 30000);
});
test('stale or invalid browser data is never overwritten', () => {
  const s = storage({ [KEY]: current() }); const b = create(s);
  const changed = current(); changed.budget = 1234; s.setItem(KEY, JSON.stringify(changed));
  assert.throws(() => b.save('shoppingList', []), /stale-storage/); assert.equal(s.json(KEY).budget, 1234);
  s.setItem(KEY, '{bad'); assert.throws(() => create(s)); assert.equal(s.getItem(KEY), '{bad');
});
test('failed multi-store save rolls back original records', () => {
  const original = { id: 'r', kind: 'laundry', name: '원본' };
  const s = storage({ [KEY]: current(), [RECORDS]: [original] }); const b = create(s);
  const write = s.setItem; let fail = true;
  s.setItem = (k, v) => { if (k === KEY && fail) { fail = false; throw Error('quota'); } write(k, v); };
  assert.throws(() => b.saveRecords([{ ...original, name: '변경' }]), /quota/);
  assert.deepEqual(s.json(RECORDS), [original]); assert.equal(s.json(KEY).extraField, 'keep');
});
test('both backup generations import without replacing newer local records', () => {
  const state = current(); state.medicines = [{ id: 'm', name: '현재', times: [] }];
  const s = storage({ [KEY]: state }); const b = create(s);
  b.importBackup({ version: 3, records: [{ id: 'r', kind: 'food', name: '식품', expiryDate: '2026-11-30' }], medicines: [{ id: 'm', name: '백업', times: ['08:00'] }], routines: [{ id: 'routine', name: '필터', nextDate: '2026-12-01', cadence: 'P1M' }], shoppingList: [{ id: 'cart', name: '품목' }] });
  const backupState = current(); backupState.timers = [{ id: 'backup-timer', endsAt: 456 }]; backupState.budget = 1;
  b.importBackup({ app: '오늘 살림', todayState: backupState, previousStorage: { [RECORDS]: JSON.stringify([{ id: 'r2', kind: 'shopping', name: '구매' }]) } });
  assert.equal(b.records().length, 2); assert.equal(b.medicines()[0].name, '현재');
  assert.equal(s.json(KEY).budget, 90000); assert.equal(s.json(KEY).timers.length, 2);
  assert.equal(b.previous('shoppingList')[0].name, '품목'); assert.equal(b.previous('routines')[0].cadence, 'P1M');
  assert.throws(() => b.importBackup({}), /invalid-backup/);
});
