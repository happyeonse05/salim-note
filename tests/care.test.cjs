const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../care-core.js');
const C = require('../core.js');
test('unfinished laundry carries to tomorrow, completed and cancelled timers remain finished', () => {
 const now = new Date('2026-11-21T08:00:00+09:00').getTime();
 const t = { minutes:45, startedAt:'2026-11-20T23:00:00+09:00', endsAt: new Date('2026-11-20T23:45:00+09:00').getTime() };
 assert.equal(H.laundryTitle(t, '2026-11-21',now),'어제부터 · 빨래 널기');
 assert.equal(H.laundryTitle(t, '2026-11-22',now+86400000),'11월 20일부터 · 빨래 널기');
 assert.equal(C.timerStatus({...t,hungAt:'2026-11-21T08:00:00+09:00'}, now).state, 'done');
 assert.equal(C.timerStatus({...t,cancelledAt:'2026-11-20T23:30:00+09:00'}, now).state, 'cancelled');
});
test('medicine shows last actual record without carrying yesterday dose into today', () => {
 const med={id:'a', name:'저녁 약', times:['21:00'],days:[0,1,2,3,4,5,6]};
 const checks={'a|2026-11-20|21:00':'2026-11-20T12:10:00.000Z','aa|2026-11-21|21:00':'2026-11-21T12:10:00.000Z','a|bad':true};
 assert.equal(H.lastCheck(checks,'a'),'2026-11-20T12:10:00.000Z');
 const today=C.doses([med],checks,new Date(2026,10,21));
 assert.equal(today.length,1); assert.equal(today[0].key,'a|2026-11-21|21:00'); assert.equal(today[0].checkedAt,null);
 assert.equal(H.lastCheck({}, 'a'),null);
});
test('expense record remains on its actual input date across the week boundary', () => {
 const rows=[{amount:4500,at:new Date(2026,10,22,23,59).toISOString()}];
 assert.equal(C.weeklyTotal(rows,new Date(2026,10,22)),4500);
 assert.equal(C.weeklyTotal(rows,new Date(2026,10,23)),0);
});
test('cosmetic calendar-month math clamps end-of-month and respects earlier printed expiry', () => {
 assert.equal(H.addMonths('2026-08-31',6),'2027-02-28');
 assert.equal(H.addMonths('2027-08-31',6),'2028-02-29');
 const e=H.cosmeticExpiry({openedAt:'2026-11-20',paoMonths:12,labelDate:'2027-05-01'},'2026-11-20');
 assert.equal(e.openedDue,'2027-11-20'); assert.equal(e.due,'2027-05-01');
 assert.equal(e.basis,'제품 표시 사용기한');
 assert.equal(H.cosmeticExpiry({category:'선크림'},'2026-11-20').due,'');
 assert.equal(H.cosmeticExpiry({paoMonths:12,labelDate:'2027-05-01'},'2026-11-20').due,'2027-05-01');
 assert.equal(H.cosmeticExpiry({openedAt:'2026-11-20'},'2026-11-20').due,'');
 assert.equal(H.cosmeticExpiry({labelDate:'2026-11-19'},'2026-11-20').days,-1);
 assert.equal(H.addMonths('2026-02-30',12),'');
});
test('quick laundry ranks actual frequency then recency; cancelled starts are excluded', () => {
 assert.equal(H.laundrySuggestions([])[0].minutes,45);
 const timers=[{minutes:30,startedAt:'2026-11-19'},{minutes:30,startedAt:'2026-11-20'},{minutes:45,startedAt:'2026-11-21'},{minutes:60,cancelledAt:'yes'}];
 assert.deepEqual(H.laundrySuggestions(timers).map(x=>x.minutes),[30,45]);
 assert.equal(H.products.find(x=>x.id==='tylenol-500').ingredient.includes('일반정'),true);
 assert.equal(H.products.find(x=>x.id==='tylenol-er-650').ingredient.includes('서방정'),true);
 assert.equal(H.products.find(x=>x.name==='타이레놀'),undefined);
});
