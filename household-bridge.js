(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SalimHousehold = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CURRENT = 'oneul-salim-v1';
  const keys = {
    records: 'salimnote-records-v1', medicines: 'salimnote-medicines-v1',
    checks: 'salimnote-med-checks-v1', routines: 'salimnote-routines-v1',
    shoppingList: 'salimnote-shopping-list-v1', notified: 'salimnote-notified-v1'
  };
  function create(storage) {
    const baseline = new Map();
    function read(key, fallback) {
      const raw = storage.getItem(key);
      baseline.set(key, raw);
      return raw === null ? structuredClone(fallback) : JSON.parse(raw);
    }
    let current = read(CURRENT, null);
    if (current && (current.version !== 1 || !Array.isArray(current.timers) || !Array.isArray(current.expenses) || !Array.isArray(current.medicines) || !current.checks || Array.isArray(current.checks) || typeof current.checks !== 'object' || (current.cosmetics !== undefined && !Array.isArray(current.cosmetics)))) throw new Error('invalid-storage');
    const previous = {};
    for (const [name, key] of Object.entries(keys)) {
      previous[name] = read(key, name === 'checks' || name === 'notified' ? {} : []);
      if (name === 'checks' || name === 'notified') {
        if (!previous[name] || typeof previous[name] !== 'object' || Array.isArray(previous[name])) throw new Error('invalid-storage');
      } else if (!Array.isArray(previous[name])) throw new Error('invalid-storage');
    }
    function commit(changes) {
      for (const [key, raw] of baseline) if (storage.getItem(key) !== raw) throw new Error('stale-storage');
      const written = [];
      try {
        for (const [key, value] of changes) {
          const raw = JSON.stringify(value);
          storage.setItem(key, raw); written.push(key);
        }
      } catch (error) {
        for (const key of written.reverse()) {
          const old = baseline.get(key);
          if (old === null) storage.removeItem(key); else storage.setItem(key, old);
        }
        throw error;
      }
      for (const [key, value] of changes) baseline.set(key, JSON.stringify(value));
    }
    const legacyCosmetics = () => previous.records.filter(x => x.kind === 'cosmetic').map(x => ({ ...x, id: `legacy:${x.id}`, category: x.category || x.cosmeticType || '기타', legacy: true }));
    function records() {
      if (!current) return structuredClone(previous.records);
      return structuredClone([...previous.records.filter(x => x.kind !== 'cosmetic'), ...(current.cosmetics || legacyCosmetics()).map(x => ({ ...x, kind: 'cosmetic' }))]);
    }
    function saveRecords(items) {
      if (!current) {
        commit([[keys.records, items]]); previous.records = structuredClone(items); return;
      }
      const originals = [...items.filter(x => x.kind !== 'cosmetic'), ...previous.records.filter(x => x.kind === 'cosmetic')];
      const cosmetics = items.filter(x => x.kind === 'cosmetic').map(x => ({ ...x }));
      // Keep explicit expense edits; only update automatically linked clothing purchases.
      const purchases = items.filter(x => x.kind === 'clothes' && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') && /^\d{1,9}$/.test(String(x.amount || '')) && Number(x.amount) > 0);
      const expenses = current.expenses.filter(x => !x.sourceId || x.updatedAt || purchases.some(p => p.id === x.sourceId));
      for (const item of purchases) {
        const old = expenses.find(x => x.sourceId === item.id);
        if (old?.updatedAt) continue;
        const expense = { ...(old || {}), id: old?.id || `previous:${item.id}`, sourceId: item.id, dateOnly: true, amount: Number(item.amount), note: item.name, at: new Date(item.date + 'T12:00:00').toISOString() };
        if (old) expenses[expenses.indexOf(old)] = expense; else expenses.push(expense);
      }
      const next = { ...current, cosmetics, expenses };
      commit([[keys.records, originals], [CURRENT, next]]);
      previous.records = structuredClone(originals); current = next;
    }
    function save(name, value) {
      if (current && (name === 'medicines' || name === 'checks')) {
        const next = { ...current, [name]: structuredClone(value) };
        commit([[CURRENT, next]]); current = next;
      } else {
        commit([[keys[name], value]]); previous[name] = structuredClone(value);
      }
    }
    function importBackup(parsed) {
      const validCurrent = value => value && value.version === 1 && Array.isArray(value.timers) && Array.isArray(value.expenses) && Array.isArray(value.medicines) && value.checks && typeof value.checks === 'object' && !Array.isArray(value.checks) && (value.cosmetics === undefined || Array.isArray(value.cosmetics));
      const decode = key => {
        const value = parsed?.previousStorage?.[key];
        return typeof value === 'string' ? JSON.parse(value) : value;
      };
      const incoming = {};
      for (const name of Object.keys(keys)) incoming[name] = decode(keys[name]) ?? parsed?.[name === 'checks' ? 'medicationChecks' : name] ?? (name === 'checks' || name === 'notified' ? {} : []);
      if (Array.isArray(parsed)) incoming.records = parsed;
      for (const name of ['records', 'medicines', 'routines', 'shoppingList']) {
        if (!Array.isArray(incoming[name]) || incoming[name].some(x => !x || typeof x.id !== 'string' || typeof x.name !== 'string')) throw new Error('invalid-backup');
      }
      if (incoming.records.some(x => !['laundry', 'shopping', 'clothes', 'food', 'cosmetic'].includes(x.kind))) throw new Error('invalid-backup');
      if (incoming.medicines.some(x => !Array.isArray(x.times)) || incoming.routines.some(x => !x.nextDate)) throw new Error('invalid-backup');
      if (!incoming.checks || typeof incoming.checks !== 'object' || Array.isArray(incoming.checks)) throw new Error('invalid-backup');
      const backupCurrent = parsed?.todayState;
      if (backupCurrent != null && !validCurrent(backupCurrent)) throw new Error('invalid-backup');
      if (!Array.isArray(parsed) && !Array.isArray(parsed?.records) && !parsed?.previousStorage && !backupCurrent) throw new Error('invalid-backup');
      const merge = (local, restored) => [...new Map([...restored, ...local].map(x => [x.id, x])).values()];
      const nextPrevious = {};
      for (const name of Object.keys(keys)) nextPrevious[name] = Array.isArray(previous[name]) ? merge(previous[name], incoming[name]) : { ...incoming[name], ...previous[name] };
      let next = current ? structuredClone(current) : backupCurrent ? structuredClone(backupCurrent) : null;
      if (next) {
        if (current && backupCurrent) {
          for (const name of ['timers', 'expenses', 'medicines', 'cosmetics']) next[name] = merge(current[name] || (name === 'cosmetics' ? legacyCosmetics() : []), backupCurrent[name] || []);
          next.checks = { ...backupCurrent.checks, ...current.checks };
          next.notifyMeds = { ...backupCurrent.notifyMeds, ...current.notifyMeds };
          next.notified = { ...backupCurrent.notified, ...current.notified };
        }
        next.medicines = merge(next.medicines, incoming.medicines);
        next.checks = { ...incoming.checks, ...next.checks };
        const cosmetics = incoming.records.filter(x => x.kind === 'cosmetic').map(x => ({ ...x, id: x.id.startsWith('legacy:') ? x.id : `legacy:${x.id}`, category: x.category || x.cosmeticType || '기타', legacy: true }));
        next.cosmetics = merge(next.cosmetics || legacyCosmetics(), cosmetics);
      }
      const changes = Object.entries(keys).map(([name, key]) => [key, nextPrevious[name]]);
      if (next) changes.push([CURRENT, next]);
      commit(changes);
      Object.assign(previous, nextPrevious); current = next;
    }
    return {
      records, saveRecords, save, importBackup,
      medicines: () => structuredClone(current ? current.medicines : previous.medicines),
      checks: () => structuredClone(current ? current.checks : previous.checks),
      previous: name => structuredClone(previous[name]),
      current: () => structuredClone(current),
      backup: () => Object.fromEntries(Object.values(keys).map(key => [key, baseline.get(key)]).filter(([, raw]) => raw !== null))
    };
  }
  return { create };
});
