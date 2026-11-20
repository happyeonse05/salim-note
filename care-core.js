(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SalimCare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const verifiedAt = '2026-11-20';
  const products = [
    { id: 'tylenol-500', name: '타이레놀정 500mg', ingredient: '아세트아미노펜 500mg · 일반정', meal: '식사 여부와 관계없이 복용할 수 있어요. 별도의 공복 유지 시간은 정해져 있지 않아요.', interval: '만 12세 이상: 필요시 4~6시간 간격. 1회 1~2정, 하루 최대 8정(4,000mg).', caution: '아세트아미노펜이 든 다른 약과 함께 복용하지 마세요. 음주·간질환이 있거나 다른 약을 복용 중이면 의사·약사에게 확인하세요.', sources: [['식약처 허가정보', 'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=199303108'], ['제조사 식사 안내', 'https://www.tylenol.co.kr/safety-dosing/faq']] },
    { id: 'tylenol-er-650', name: '타이레놀8시간이알서방정 650mg', ingredient: '아세트아미노펜 650mg · 서방정', meal: '식사 여부와 관계없이 복용할 수 있어요. 별도의 공복 유지 시간은 정해져 있지 않아요.', interval: '만 12세 이상: 8시간 간격, 1회 2정. 24시간 최대 6정. 일반 500mg 정과 복용 간격이 달라요.', caution: '쪼개거나 씹거나 녹이지 말고 그대로 삼키세요. 아세트아미노펜이 든 다른 약과 함께 복용하지 마세요. 음주·간질환·병용약은 의사·약사에게 확인하세요.', sources: [['식약처 허가정보', 'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=202200407'], ['제조사 식사 안내', 'https://www.tylenol.co.kr/safety-dosing/faq']] },
    { id: 'gaviscon-double-liquid', name: '개비스콘 더블액션 현탁액', ingredient: '알긴산나트륨·탄산수소나트륨·탄산칼슘 · 현탁액', meal: '식후 및 취침 전에 복용하는 제품이에요. 식후 몇 분인지 임의로 계산하지 않아요.', interval: '성인 및 만 12세 이상: 1회 10~20mL, 하루 4회(식후 및 취침 전).', caution: '신장질환·심부전·나트륨 제한·고칼슘혈증이 있거나 다른 약을 복용 중이면 의사·약사에게 먼저 확인하세요. 12세 미만은 전문가에게 확인하세요.', sources: [['제조사 제품 설명', 'https://www.gaviscon.co.kr/']] }
  ];
  const categories = ['토너·스킨', '로션·크림', '에센스·세럼', '선크림', '파운데이션·쿠션', '립 제품', '마스카라·아이라이너', '클렌저', '기타'];
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const d = new Date(value + 'T12:00:00');
    return Number.isFinite(d.getTime()) && day(d) === value ? d : null;
  }
  function day(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function addMonths(value, months) {
    const d = date(value), n = Number(months);
    if (!d || !Number.isInteger(n) || n < 1 || n > 120) return '';
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), last)); return day(target);
  }
  function cosmeticExpiry(item, today = day(new Date())) {
    const label = date(item.labelDate) ? item.labelDate : '';
    const opened = item.openedAt ? addMonths(item.openedAt, item.paoMonths) : '';
    const due = [label, opened].filter(Boolean).sort()[0] || '';
    const delta = due && date(today) ? Math.round((Date.UTC(...due.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - Date.UTC(...today.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)))) / 86400000) : null;
    return { due, openedDue: opened, labelDate: label, days: delta, basis: due ? due === label ? '제품 표시 사용기한' : '개봉일 + 제품 표시 사용기간' : '제품 표시 확인 필요' };
  }
  function lastCheck(checks, id) {
    return Object.entries(checks).filter(([key, at]) => key.split('|')[0] === String(id) && typeof at === 'string' && Number.isFinite(new Date(at).getTime())).map(([, at]) => at).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  }
  function laundryTitle(timer, today, now = Date.now()) {
    const left = Math.max(0, Math.ceil((Number(timer.endsAt) - Number(now)) / 60000));
    if (left > 0) return `빨래 · ${left}분 남음`;
    const start = new Date(timer.startedAt), startDay = Number.isFinite(start.getTime()) ? day(start) : today;
    if (startDay < today) {
      const yesterday = new Date(today + 'T12:00:00'); yesterday.setDate(yesterday.getDate() - 1);
      return `${startDay === day(yesterday) ? '어제부터' : `${Number(startDay.slice(5, 7))}월 ${Number(startDay.slice(8))}일부터`} · 빨래 널기`;
    }
    return '설정 시간 끝 · 빨래 널기';
  }
  function laundrySuggestions(timers) {
    const groups = new Map();
    for (const t of timers) {
      if (t.cancelledAt || !Number.isInteger(t.minutes) || t.minutes < 1 || t.minutes > 1440) continue;
      const old = groups.get(t.minutes) || { minutes: t.minutes, count: 0, at: '', notify: false };
      old.count++; if (t.startedAt > old.at) { old.at = t.startedAt; old.notify = Boolean(t.notify); }
      groups.set(t.minutes, old);
    }
    if (!groups.size) return [{ minutes: 45, count: 0, at: '', notify: false }];
    return [...groups.values()].sort((a, b) => b.count - a.count || b.at.localeCompare(a.at)).slice(0, 3);
  }
  return { products, verifiedAt, categories, date, day, addMonths, cosmeticExpiry, lastCheck, laundryTitle, laundrySuggestions };
});
