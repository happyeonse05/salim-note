(() => {
      const KEY = 'salimnote-records-v1';
      const MEDS_KEY = 'salimnote-medicines-v1';
      const CHECKS_KEY = 'salimnote-med-checks-v1';
      const NOTIFIED_KEY = 'salimnote-notified-v1';
      const NOTIFICATION_ENABLED_KEY = 'salimnote-notifications-enabled-v1';
      const ROUTINES_KEY = 'salimnote-routines-v1';
      const SHOPPING_LIST_KEY = 'salimnote-shopping-list-v1';
      const icons = { laundry: '◌', shopping: '⌑', clothes: '♧', food: '◉', cosmetic: '✿' };
      const labels = { laundry: '빨래', shopping: '장보기', clothes: '옷 구매', food: '식품', cosmetic: '화장품' };
      let bridge;
      try { bridge = window.SalimHousehold.create(localStorage); }
      catch { const notice = document.getElementById('householdError'); notice.hidden = false; notice.textContent = '저장 데이터를 읽지 못했어요. 원본은 덮어쓰지 않았습니다. 오늘 화면에서 먼저 백업해 주세요.'; return; }
      window.addEventListener('error', event => {
        if (!/stale-storage|invalid-storage|quota/i.test(String(event.error?.message || event.message))) return;
        const notice = document.getElementById('householdError'); notice.hidden = false;
        notice.textContent = '다른 화면에서 기록이 바뀌었거나 저장하지 못했어요. 새로고침 후 다시 확인해 주세요. 원본은 덮어쓰지 않았습니다.';
      });
      const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
      let today = localDateString(new Date());
      let records = bridge.records();
      let medicines = bridge.medicines();
      let medicationChecks = bridge.checks();
      let notified = bridge.previous('notified');
      let routines = bridge.previous('routines');
      let shoppingList = bridge.previous('shoppingList');
      if (!Array.isArray(routines)) routines = [];
      if (!Array.isArray(shoppingList)) shoppingList = [];
      let notificationsEnabled = localStorage.getItem(NOTIFICATION_ENABLED_KEY) === 'true';
      let currentView = 'overview';
      let currentType = 'laundry';
      let editingItem = null;
      let editingMedicineId = null;
      let recordReturnFocus = null;
      let medicationReturnFocus = null;
      let editingRoutineId = null;
      let toastTimer;

      function localDateString(date) {
        const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return d.toISOString().slice(0, 10);
      }
      function dateObject(value) { return value ? new Date(value + 'T12:00:00') : null; }
      function addDays(dateValue, days) {
        const d = dateObject(dateValue);
        if (!d) return '';
        d.setDate(d.getDate() + Number(days || 0));
        return localDateString(d);
      }
      function formatDate(value, withYear = true) {
        const d = dateObject(value);
        if (!d || Number.isNaN(d.getTime())) return '날짜 없음';
        return new Intl.DateTimeFormat('ko-KR', { year: withYear ? 'numeric' : undefined, month: 'long', day: 'numeric' }).format(d);
      }
      function daysUntil(value) {
        const target = dateObject(value); const base = dateObject(today);
        if (!target || !base) return Infinity;
        return Math.round((target - base) / 86400000);
      }
      function addMonths(dateValue, months) {
        const d = dateObject(dateValue);
        if (!d) return '';
        const day = d.getDate();
        d.setDate(1); d.setMonth(d.getMonth() + Number(months || 0));
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, lastDay));
        return localDateString(d);
      }
      function cadenceLabel(cadence) {
        return ({ P7D: '매주', P14D: '2주마다', P1M: '매월', P3M: '3개월마다', P6M: '6개월마다', P1Y: '매년' })[cadence] || '매월';
      }
      function advanceRoutineDate(dateValue, cadence) {
        const match = /^P(\d+)([DMY])$/.exec(cadence || 'P1M');
        if (!match) return addMonths(dateValue, 1);
        const amount = Number(match[1]);
        if (match[2] === 'D') return addDays(dateValue, amount);
        return addMonths(dateValue, amount * (match[2] === 'Y' ? 12 : 1));
      }
      function safeDeadline(item) {
        if (item.kind === 'food') return item.expiryDate || '';
        if (item.kind === 'cosmetic') return window.SalimCare.cosmeticExpiry(item, today).due;
        return '';
      }
      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      }
      function save() { bridge.saveRecords(records); }
      function saveMedicines() { bridge.save('medicines', medicines); }
      function saveChecks() { bridge.save('checks', medicationChecks); }
      function saveNotified() { bridge.save('notified', notified); }
      function saveRoutines() { bridge.save('routines', routines); }
      function saveShoppingList() { bridge.save('shoppingList', shoppingList); }
      function showToast(message) {
        const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show');
        clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
      }
      function activityDate(item) { return item.kind === 'cosmetic' ? (item.openedAt || item.registeredAt || today) : (item.date || item.registeredAt || today); }
      function sortedRecords(items = records) { return [...items].sort((a,b) => (activityDate(b) || '').localeCompare(activityDate(a) || '')); }
      function expiringRecords() {
        return records.filter(x => (x.kind === 'food' || x.kind === 'cosmetic') && !x.finishedAt).map(x => ({ ...x, deadline: safeDeadline(x) }))
          .filter(x => x.deadline && daysUntil(x.deadline) <= 60).sort((a,b) => a.deadline.localeCompare(b.deadline));
      }
      function deadlineLabel(item) {
        const days = daysUntil(item.deadline);
        if (!item.deadline) return { text: '제품 표시 확인 필요', className: '' };
        if (days < 0) return { text: `${Math.abs(days)}일 지남`, className: 'past' };
        if (days === 0) return { text: '오늘까지', className: 'urgent' };
        return { text: `D-${days}`, className: days <= 7 ? 'urgent' : '' };
      }
      function doseKey(medId, date, time) { return `${medId}|${date}|${time}`; }
      function scheduledToday(med, date = today) {
        const day = dateObject(date)?.getDay();
        if (day === undefined || !(med.days || [0,1,2,3,4,5,6]).includes(day)) return false;
        if (med.startDate && date < med.startDate) return false;
        if (med.endDate && date > med.endDate) return false;
        return true;
      }
      function timeMinutes(value) {
        const [h, m] = String(value || '00:00').split(':').map(Number);
        return h * 60 + m;
      }
      function todayDoses() {
        return medicines.filter(med => scheduledToday(med)).flatMap(med => (med.times || []).map(time => ({
          med, time, key: doseKey(med.id, today, time), done: Boolean(medicationChecks[doseKey(med.id, today, time)])
        }))).sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name, 'ko'));
      }
      function currentMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
      function renderDoseRows(container, compact = false) {
        const doses = todayDoses();
        if (!doses.length) {
          container.innerHTML = compact
            ? `<div class="empty-state dose-empty"><div class="dose-empty-copy"><strong>오늘 복용 일정이 없어요</strong><span>약 관리에서 약과 시간을 추가하면 이곳에서 확인할 수 있어요.</span></div><img src="assets/salim-cute-medicine-v1-web.png" alt="" aria-hidden="true"></div>`
            : `<div class="empty-state"><strong>오늘 등록된 복용 일정이 없습니다</strong><span>약 관리에서 약과 시간을 추가하세요.</span></div>`;
          return;
        }
        const now = currentMinutes();
        container.innerHTML = doses.map(({ med, time, key, done }) => {
          const late = !done && now >= timeMinutes(time);
          const state = done ? '완료' : late ? '미체크' : '예정';
          return `<div class="med-dose-row"><div class="med-dose-time">${escapeHtml(time)}</div><div class="med-dose-copy"><div class="med-dose-name">${escapeHtml(med.name)}</div><div class="med-dose-meta">${escapeHtml(med.dose || '복용량 미입력')}${late ? ' · 예정 시간 지남' : ''}</div></div><span class="dose-status ${done ? 'done' : late ? 'late' : ''}">${state}</span><button class="dose-button ${done ? 'done' : ''}" data-dose-id="${escapeHtml(med.id)}" data-dose-time="${escapeHtml(time)}">${done ? '체크 취소' : '복용 완료'}</button></div>`;
        }).join('');
      }
      function renderMedicineList() {
        const target = document.getElementById('medList');
        if (!medicines.length) {
          target.innerHTML = `<div class="empty-state"><strong>등록된 약이 없습니다</strong><span>복용할 약을 추가해 일정을 설정하세요.</span></div>`;
          return;
        }
        target.innerHTML = medicines.map(med => {
          const times = (med.times || []).slice().sort().join(' · ');
          const days = (med.days || [0,1,2,3,4,5,6]).map(d => weekdays[d]).join(' ');
          const range = [med.startDate ? `${formatDate(med.startDate, false)} 시작` : '', med.endDate ? `${formatDate(med.endDate, false)} 종료` : ''].filter(Boolean).join(' · ');
          return `<article class="med-card"><div class="record-icon">＋</div><div class="med-card-main"><div class="med-card-name">${escapeHtml(med.name)}</div><div class="med-card-info">${escapeHtml(med.dose || '복용량 미입력')} · ${escapeHtml(times)}<br>${escapeHtml(days)}${range ? ` · ${escapeHtml(range)}` : ''}</div></div><div class="med-card-actions"><button class="edit-button" data-edit-med="${escapeHtml(med.id)}" aria-label="${escapeHtml(med.name)} 수정" title="수정">✎</button><button class="delete-button" data-delete-med="${escapeHtml(med.id)}" aria-label="${escapeHtml(med.name)} 삭제" title="삭제">×</button></div></article>`;
        }).join('');
      }
      function renderMedications() {
        renderDoseRows(document.getElementById('dashboardDoseList'), true);
        renderDoseRows(document.getElementById('medDoseList'));
        renderMedicineList();
        const doses = todayDoses();
        const missed = doses.filter(d => !d.done && currentMinutes() >= timeMinutes(d.time)).length;
        document.getElementById('medTodayCaption').textContent = `${doses.filter(d => d.done).length}/${doses.length}회 완료${missed ? ` · 미체크 ${missed}회` : ''}`;
        document.getElementById('navMedCount').textContent = missed ? missed : '';
        const summary = document.getElementById('dashboardSummaryText');
        if (summary) summary.textContent = `복용 ${doses.filter(d => d.done).length}/${doses.length}회 완료 · 오늘 할 일 ${routines.filter(item => daysUntil(item.nextDate) <= 0).length}개 · 사용기한 임박 ${expiringRecords().length}개`;
      }
      function renderNotificationButton() {
        const button = document.getElementById('notificationButton');
        button.classList.toggle('enabled', notificationsEnabled);
        button.title = '복용 예정 시간, 사용기한, 반복 일정 알림';
        button.innerHTML = `<span>◷</span> ${notificationsEnabled ? '알림 끄기' : '알림 켜기'}`;
        document.getElementById('sideNotificationStatus').textContent = notificationsEnabled ? '브라우저 알림 켜짐' : '브라우저 알림 꺼짐';
      }
      async function toggleNotifications() {
        if (notificationsEnabled) {
          notificationsEnabled = false;
          localStorage.setItem(NOTIFICATION_ENABLED_KEY, 'false');
          renderNotificationButton(); showToast('브라우저 알림을 껐어요.'); return;
        }
        if (!('Notification' in window)) { showToast('이 브라우저에서는 알림을 지원하지 않아요.'); return; }
        try {
          const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
          if (permission !== 'granted') { showToast('브라우저 설정에서 알림을 허용해 주세요.'); return; }
          notificationsEnabled = true;
          localStorage.setItem(NOTIFICATION_ENABLED_KEY, 'true');
          renderNotificationButton(); showToast('복용·사용기한·반복 일정 알림을 켰어요.'); checkNotifications();
        } catch { showToast('알림 권한을 설정하지 못했어요.'); }
      }
      function sendBrowserNotification(title, body, tag, view) {
        if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
        try {
          const notification = new Notification(title, { body, tag });
          notification.onclick = () => { window.focus(); switchView(view); notification.close(); };
        } catch { showToast('브라우저 알림을 표시하지 못했어요.'); }
      }
      function checkNotifications() {
        const currentDate = localDateString(new Date());
        if (currentDate !== today) { today = currentDate; render(); }
        if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
        for (const item of records.filter(x => (x.kind === 'food' || x.kind === 'cosmetic') && !x.finishedAt)) {
          const deadline = safeDeadline(item); const days = daysUntil(deadline);
          if (!deadline || days < 0 || days > 3) continue;
          const key = `expiry:${item.id}:${deadline}`;
          if (notified[key]) continue;
          notified[key] = new Date().toISOString(); saveNotified();
          sendBrowserNotification('사용기한 확인', `${item.name} · ${days < 0 ? `${Math.abs(days)}일 지남` : days === 0 ? '오늘까지' : `${days}일 남음`}`, key, 'expiry');
        }
        for (const routine of routines) {
          if (daysUntil(routine.nextDate) !== 0) continue;
          const key = `routine:${routine.id}:${routine.nextDate}`;
          if (notified[key]) continue;
          notified[key] = new Date().toISOString(); saveNotified();
          sendBrowserNotification('오늘 반복 일정', `${routine.name} 일정이 오늘이에요.`, key, 'routines');
        }
        const now = currentMinutes();
        for (const dose of todayDoses()) {
          if (dose.done || (bridge.current() && !bridge.current().notifyMeds?.[dose.med.id])) continue;
          const overdue = now - timeMinutes(dose.time);
          if (overdue < 0) continue;
          const stage = overdue >= 60 ? 'followup' : 'due';
          const key = `med:${dose.key}:${stage}`;
          if (notified[key]) continue;
          notified[key] = new Date().toISOString(); saveNotified();
          sendBrowserNotification('복용 기록 확인', `${dose.time}에 등록한 일정이 있어요. 앱에서 확인해 주세요.`, key, 'medications');
        }
      }
      function toggleDose(medId, time) {
        const key = doseKey(medId, today, time);
        if (medicationChecks[key]) delete medicationChecks[key];
        else medicationChecks[key] = new Date().toISOString();
        saveChecks(); render();
      }
      function routineDueText(date) {
        const days = daysUntil(date);
        if (!Number.isFinite(days)) return '날짜 없음';
        if (days < 0) return `${Math.abs(days)}일 지남`;
        if (days === 0) return '오늘';
        return `${days}일 후`;
      }
      function renderRoutinePreview() {
        const target = document.getElementById('dashboardRoutineList');
        const upcoming = [...routines].sort((a,b) => (a.nextDate || '').localeCompare(b.nextDate || '')).slice(0,3);
        target.innerHTML = upcoming.length ? upcoming.map(item => {
          const days = daysUntil(item.nextDate);
          const state = days < 0 ? 'overdue' : days === 0 ? 'urgent' : '';
          return `<div class="routine-preview-row"><div class="routine-preview-copy"><div class="routine-preview-name">${escapeHtml(item.name)}</div><div class="routine-preview-date">${formatDate(item.nextDate, false)} · ${cadenceLabel(item.cadence)}</div></div><span class="routine-due ${state}">${routineDueText(item.nextDate)}</span></div>`;
        }).join('') : `<div class="empty-state"><strong>등록된 반복 일정이 없습니다</strong><span>집안일을 등록하면 다음 날짜를 보여드려요.</span></div>`;
      }
      function renderRoutines() {
        const target = document.getElementById('routineList');
        const sorted = [...routines].sort((a,b) => (a.nextDate || '').localeCompare(b.nextDate || ''));
        const dueCount = routines.filter(item => daysUntil(item.nextDate) <= 0).length;
        document.getElementById('navRoutineCount').textContent = dueCount || '';
        target.innerHTML = sorted.length ? sorted.map(item => {
          const days = daysUntil(item.nextDate);
          const state = days < 0 ? 'overdue' : days === 0 ? 'urgent' : '';
          const doneLabel = item.lastDone ? `마지막 완료 ${formatDate(item.lastDone, false)}` : '아직 완료 기록 없음';
          return `<article class="routine-row"><div class="routine-copy"><div class="routine-name">${escapeHtml(item.name)}</div><div class="routine-meta">${cadenceLabel(item.cadence)} · ${doneLabel}</div></div><span class="routine-due ${state}">${formatDate(item.nextDate, false)} · ${routineDueText(item.nextDate)}</span><div class="routine-actions"><button class="edit-button" type="button" data-routine-edit="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 수정" title="수정">✎</button><button class="routine-done" type="button" data-routine-done="${escapeHtml(item.id)}">완료</button><button class="routine-delete" type="button" data-routine-delete="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 삭제" title="삭제">×</button></div></article>`;
        }).join('') : `<div class="empty-state"><strong>등록된 일정이 없습니다</strong><span>위 입력란에서 반복할 집안일을 추가하세요.</span></div>`;
        renderRoutinePreview();
      }
      function renderShoppingList() {
        const target = document.getElementById('shoppingItems');
        const checked = shoppingList.filter(item => item.done);
        document.getElementById('shoppingCount').textContent = `${shoppingList.length}개`;
        document.getElementById('shoppingCheckedCount').textContent = `체크한 항목 ${checked.length}개`;
        document.getElementById('saveShoppingPurchase').disabled = checked.length === 0;
        target.innerHTML = shoppingList.length ? shoppingList.map(item => `<div class="shopping-item ${item.done ? 'checked' : ''}"><input type="checkbox" data-shopping-toggle="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} aria-label="${escapeHtml(item.name)} 구매 여부"><span class="shopping-item-name">${escapeHtml(item.name)}</span><button class="shopping-remove" type="button" data-shopping-remove="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 삭제">×</button></div>`).join('') : `<div class="empty-state basket-empty"><img src="assets/salim-cute-basket-v1-web.png" alt="" width="150" height="140"><strong>장바구니를 채워보세요</strong><span>위에 살 물건을 적고 ‘담기’를 누르세요.</span></div>`;
      }
      function addShoppingListItem() {
        const input = document.getElementById('shoppingItemInput');
        const name = input.value.trim();
        if (!name) { showToast('살 물건을 입력해 주세요.'); input.focus(); return; }
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        shoppingList.unshift({ id, name, done: false, createdAt: today });
        saveShoppingList(); input.value = ''; renderShoppingList(); input.focus();
      }
      function saveCheckedShoppingItems() {
        const checked = shoppingList.filter(item => item.done);
        if (!checked.length) return;
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        records.unshift({ id, kind: 'shopping', name: `장보기 ${checked.length}개`, note: checked.map(item => item.name).join(', '), date: today, registeredAt: today });
        shoppingList = shoppingList.filter(item => !item.done);
        save(); saveShoppingList(); render(); showToast(`${checked.length}개 품목을 장보기 기록에 저장했어요.`);
      }
      function saveRoutine(event) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const name = String(data.get('name') || '').trim();
        const nextDate = String(data.get('nextDate') || '');
        const cadence = String(data.get('cadence') || 'P1M');
        if (!name) { showToast('할 일을 입력해 주세요.'); document.getElementById('routineName').focus(); return; }
        if (!nextDate) return;
        const old = routines.find(item => item.id === editingRoutineId);
        const id = old?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const updated = { ...(old || {}), id, name, nextDate, cadence, createdAt: old?.createdAt || today, lastDone: old?.lastDone || '' };
        routines = old ? routines.map(item => item.id === id ? updated : item) : [...routines, updated];
        editingRoutineId = null;
        saveRoutines(); event.currentTarget.reset(); document.getElementById('routineNextDate').value = today;
        document.getElementById('routineSubmitButton').innerHTML = '<span class="plus">＋</span> 일정 등록';
        render(); showToast(old ? '반복 일정을 수정했어요.' : '반복 일정을 등록했어요.');
      }
      function editRoutine(id) {
        const item = routines.find(routine => routine.id === id);
        if (!item) return;
        editingRoutineId = item.id;
        document.getElementById('routineName').value = item.name;
        document.getElementById('routineNextDate').value = item.nextDate;
        document.getElementById('routineCadence').value = item.cadence || 'P1M';
        document.getElementById('routineSubmitButton').innerHTML = '수정 저장';
        document.getElementById('routineForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('routineName').focus({ preventScroll: true });
      }
      function completeRoutine(id) {
        const item = routines.find(routine => routine.id === id);
        if (!item) return;
        item.lastDone = today;
        item.nextDate = advanceRoutineDate(today, item.cadence);
        saveRoutines(); render(); showToast(`완료했어요. 다음 일정은 ${formatDate(item.nextDate, false)}예요.`);
      }
      function deleteRoutine(id) {
        const item = routines.find(routine => routine.id === id);
        if (!item || !window.confirm(`“${item.name}” 반복 일정을 삭제할까요?`)) return;
        routines = routines.filter(routine => routine.id !== id); saveRoutines(); render(); showToast('반복 일정을 삭제했어요.');
      }
      function escapeIcs(value) {
        return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
      }
      function calendarDate(value) { return String(value || today).replaceAll('-', ''); }
      function foldIcsLine(line) {
        const encoder = new TextEncoder();
        const parts = []; let current = ''; let size = 0;
        for (const character of String(line)) {
          const width = encoder.encode(character).length;
          if (size + width > 75) { parts.push(current); current = character; size = width + 1; }
          else { current += character; size += width; }
        }
        parts.push(current);
        return parts.join('\r\n ');
      }
      function calendarRule(cadence) {
        if (cadence === 'P7D') return 'FREQ=DAILY;INTERVAL=7';
        if (cadence === 'P14D') return 'FREQ=DAILY;INTERVAL=14';
        if (cadence === 'P3M') return 'FREQ=MONTHLY;INTERVAL=3';
        if (cadence === 'P6M') return 'FREQ=MONTHLY;INTERVAL=6';
        if (cadence === 'P1Y') return 'FREQ=YEARLY;INTERVAL=1';
        return 'FREQ=MONTHLY;INTERVAL=1';
      }
      function exportCalendar() {
        if (!routines.length) { showToast('먼저 반복 일정을 등록해 주세요.'); return; }
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const events = routines.map(item => [
          'BEGIN:VEVENT',
          `UID:${escapeIcs(item.id)}@salim-note.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${calendarDate(item.nextDate)}`,
          'DURATION:P1D',
          `RRULE:${calendarRule(item.cadence)}`,
          `SUMMARY:${escapeIcs(item.name)}`,
          `DESCRIPTION:${escapeIcs(`살림 기록 반복 일정 · ${cadenceLabel(item.cadence)}`)}`,
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeIcs(`${item.name} 일정이 오늘이에요.`)}`,
          'TRIGGER;RELATED=START:PT9H',
          'END:VALARM',
          'END:VEVENT'
        ].join('\r\n')).join('\r\n');
        const calendar = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Salim Note//Household Routine//KO\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:살림 기록 반복 일정\r\n${events}\r\nEND:VCALENDAR\r\n`;
        const foldedCalendar = calendar.split('\r\n').map(foldIcsLine).join('\r\n');
        const blob = new Blob([foldedCalendar], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = `살림기록-반복일정-${today}.ics`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('캘린더 파일을 저장했어요.');
      }
      function render() {
        today = localDateString(new Date());
        renderDate(); renderDashboard(); renderList(); renderMedications(); renderRoutines(); renderShoppingList(); renderNotificationButton(); updateNav();
        const addLabel = currentView === 'medications' ? '약 추가' : currentView === 'routines' ? '일정 추가' : '기록 추가';
        document.getElementById('openAdd').innerHTML = `<span class="plus">＋</span> ${addLabel}`;
        const nextDate = document.getElementById('routineNextDate');
        if (nextDate && !nextDate.value) nextDate.value = today;
      }
      function renderDate() {
        const d = new Date();
        document.getElementById('todayChip').textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(d);
        document.getElementById('dashboardToday').textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(d);
      }
      function renderDashboard() {
        const thisMonth = today.slice(0,7);
        document.getElementById('laundryStat').textContent = records.filter(x => x.kind === 'laundry' && activityDate(x).startsWith(thisMonth)).length;
        document.getElementById('shoppingStat').textContent = records.filter(x => x.kind === 'shopping' && activityDate(x).startsWith(thisMonth)).length;
        document.getElementById('clothesStat').textContent = records.filter(x => x.kind === 'clothes' && activityDate(x).startsWith(thisMonth)).length;
        const alerts = expiringRecords();
        document.getElementById('navExpiryCount').textContent = alerts.length || '';
        const alertList = document.getElementById('alertList');
        if (!alerts.length) {
          alertList.innerHTML = `<div class="empty-state alert-empty"><div class="alert-empty-copy"><strong>기한 임박 항목 없음</strong><span>식품·화장품을 등록하면 이곳에 표시됩니다.</span></div><img src="assets/salim-cute-expiry-v1-web.png" alt="" aria-hidden="true"></div>`;
        } else {
          alertList.innerHTML = alerts.slice(0,4).map(item => {
            const due = deadlineLabel(item);
            return `<div class="alert-row ${due.className === 'urgent' || due.className === 'past' ? 'urgent' : ''}"><div class="alert-symbol">${icons[item.kind]}</div><div class="alert-meta"><div class="alert-name">${escapeHtml(item.name)}</div><div class="alert-date">${labels[item.kind]} · ${formatDate(item.deadline, false)}까지</div></div><span class="deadline ${due.className}">${due.text}</span></div>`;
          }).join('');
        }
        const activity = sortedRecords().slice(0,4);
        const activityList = document.getElementById('activityList');
        activityList.innerHTML = activity.length ? activity.map(item => `<div class="activity-row"><div class="activity-icon">${icons[item.kind]}</div><div class="activity-main"><div class="activity-name">${escapeHtml(item.name)}</div><div class="activity-sub">${formatDate(activityDate(item), false)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</div></div><span class="activity-kind">${labels[item.kind]}</span></div>`).join('') : `<div class="empty-state activity-empty"><div class="activity-empty-copy"><strong>기록 없음</strong><span>기록 추가에서 새 항목을 입력하세요.</span></div><img src="assets/salim-cute-chores-v1-web.png" alt="" aria-hidden="true"></div>`;
      }
      function viewItems() {
        if (currentView === 'expiry') return sortedRecords(records.filter(x => x.kind === 'food' || x.kind === 'cosmetic'));
        if (currentView === 'food') return sortedRecords(records.filter(x => x.kind === 'food'));
        if (currentView === 'laundry') return sortedRecords(records.filter(x => x.kind === 'laundry'));
        if (currentView === 'shopping') return sortedRecords(records.filter(x => x.kind === 'shopping'));
        if (currentView === 'clothes') return sortedRecords(records.filter(x => x.kind === 'clothes'));
        return sortedRecords();
      }
      function renderList() {
        const isMedicationView = currentView === 'medications';
        const isRoutineView = currentView === 'routines';
        const isList = currentView !== 'overview' && !isMedicationView && !isRoutineView;
        document.getElementById('dashboard').style.display = currentView === 'overview' ? 'grid' : 'none';
        document.getElementById('listSection').classList.toggle('visible', isList);
        document.getElementById('medSection').classList.toggle('visible', isMedicationView);
        document.getElementById('routineSection').classList.toggle('visible', isRoutineView);
        document.getElementById('shoppingListPanel').classList.toggle('visible', currentView === 'shopping');
        if (!isList) return;
        const titleMap = { all: ['모든 기록', '전체 생활 기록'], food: ['식품', '제품에 표시된 날짜와 보관 메모'], expiry: ['사용기한', '제품에 표시된 날짜와 개봉 후 사용기간'], laundry: ['빨래', '세탁 날짜와 메모'], shopping: ['장보기 기록', '산 물건과 장본 날짜를 모아보세요.'], clothes: ['옷 구매', '구매 날짜와 가격'] };
        document.getElementById('listTitle').textContent = titleMap[currentView]?.[0] || '모든 기록';
        document.getElementById('listCaption').textContent = titleMap[currentView]?.[1] || '';
        const q = document.getElementById('searchInput').value.trim().toLowerCase();
        let items = viewItems().filter(item => !q || [item.name, item.note, labels[item.kind]].filter(Boolean).join(' ').toLowerCase().includes(q));
        if (document.getElementById('sortSelect').value === 'oldest') items = items.reverse();
        const list = document.getElementById('recordList');
        if (!items.length) {
          list.innerHTML = `<div class="panel empty-state"><strong>${q ? '검색 결과 없음' : '기록 없음'}</strong><span>${q ? '다른 검색어를 입력하세요.' : '새 기록 버튼으로 항목을 추가하세요.'}</span></div>`;
          return;
        }
        list.innerHTML = items.map(item => recordCard(item)).join('');
      }
      function recordCard(item) {
        const date = activityDate(item);
        let details = [`${labels[item.kind]}`, formatDate(date, false)];
        let deadline = '';
        if (item.kind === 'food' || item.kind === 'cosmetic') {
          const due = safeDeadline(item); const d = deadlineLabel({ deadline: due });
          const secondary = item.kind === 'food' ? (item.dateType || '기한') : item.paoMonths ? `제품 표시 ${item.paoMonths}개월` : '사용기간 미확인';
          details.push(secondary);
          deadline = `<div class="record-deadline"><small>${item.kind === 'cosmetic' ? '관리 날짜' : (item.dateType || '기한')}</small>${formatDate(due, false)}<br><span class="deadline ${d.className}">${d.text}</span></div>`;
        } else if (item.amount) details.push(`${Number(item.amount).toLocaleString('ko-KR')}원`);
        if (item.note) details.push(item.note);
        if (item.finishedAt) details.push('사용 완료');
        const thumbnail = item.photo ? `<button class="record-photo" data-photo="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 사진 보기"><img src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.name)} 사진"></button>` : `<div class="record-icon">${icons[item.kind]}</div>`;
        return `<article class="record-card">${thumbnail}<div class="record-copy"><div class="record-title">${escapeHtml(item.name)}</div><div class="record-detail">${details.map(x => `<span>${escapeHtml(x)}</span>`).join('<span>·</span>')}</div></div><div class="record-right">${deadline}<button class="edit-button" data-edit="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 기록 수정" title="수정">✎</button><button class="delete-button" data-delete="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 기록 삭제" title="삭제">×</button></div></article>`;
      }
      function updateNav() {
        document.querySelectorAll('.nav-item').forEach(button => {
          const active = button.dataset.view === currentView || (button.dataset.view === 'overview' && currentView === 'all');
          button.classList.toggle('active', active);
          if (active) button.setAttribute('aria-current', 'page');
          else button.removeAttribute('aria-current');
        });
      }
      function switchView(view) {
        currentView = view; if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view); document.getElementById('searchInput').value = '';
        document.getElementById('openAdd').innerHTML = '<span class="plus">＋</span> ' + ({ medications: '약 추가', routines: '일정 추가' }[view] || '기록 추가');
        document.getElementById('pageTitle').textContent = ({ overview: '우리집 살림', expiry: '사용기한', food: '식품', medications: '복용 체크', laundry: '빨래', shopping: '장바구니', clothes: '옷 구매', routines: '반복 관리', all: '모든 기록' }[view] || '살림 기록');
        render(); window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      function openModal(type = 'laundry', item = null) {
        recordReturnFocus = document.activeElement;
        editingItem = item ? { ...item } : null;
        currentType = editingItem?.kind || type;
        document.getElementById('typeTabs').style.display = editingItem ? 'none' : 'grid';
        updateTabs(); renderForm();
        document.getElementById('modalBackdrop').classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.querySelector('#formFields input')?.focus(), 30);
      }
      function closeModal() {
        const backdrop = document.getElementById('modalBackdrop');
        if (!backdrop.classList.contains('open')) return;
        backdrop.classList.remove('open'); document.body.style.overflow = ''; editingItem = null;
        if (recordReturnFocus?.isConnected) recordReturnFocus.focus({ preventScroll: true });
        recordReturnFocus = null;
      }
      function updateTabs() {
        document.querySelectorAll('.type-tab').forEach(tab => {
          const selected = tab.dataset.type === currentType;
          tab.classList.toggle('active', selected);
          tab.setAttribute('aria-pressed', String(selected));
        });
      }
      function field(label, name, type = 'text', value = '', opts = {}) {
        const full = opts.full ? ' full' : '';
        if (type === 'select') return `<div class="field${full}"><label for="${name}">${label}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label><select id="${name}" name="${name}" ${opts.attrs || ''}>${opts.options.map(o => `<option value="${escapeHtml(o.value)}" ${String(value) === String(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
        if (type === 'textarea') return `<div class="field${full}"><label for="${name}">${label}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label><textarea id="${name}" name="${name}" placeholder="${escapeHtml(opts.placeholder || '')}">${escapeHtml(value)}</textarea></div>`;
        return `<div class="field${full}"><label for="${name}">${label}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(opts.placeholder || '')}" ${opts.required ? 'required' : ''} ${opts.min ? `min="${opts.min}"` : ''} ${opts.max ? `max="${opts.max}"` : ''} ${opts.attrs || ''}></div>`;
      }
      function renderForm() {
        const fields = document.getElementById('formFields');
        const preview = document.getElementById('calcPreview');
        preview.hidden = currentType !== 'cosmetic';
        const current = editingItem || {};
        const commonName = field(currentType === 'food' || currentType === 'cosmetic' ? '제품명' : '기록 이름', 'name', 'text', current.name || '', { full: true, required: true, placeholder: ({ laundry: '예: 수건·흰옷 세탁', shopping: '예: 주말 장보기', clothes: '예: 네이비 가디건', food: '예: 우유 900ml', cosmetic: '예: 수분 세럼' })[currentType] });
        if (currentType === 'laundry') fields.innerHTML = commonName + field('빨래한 날짜', 'date', 'date', current.date || today, { required: true }) + field('메모', 'note', 'textarea', current.note || '', { full: true, placeholder: '세탁 코스 메모' });
        if (currentType === 'shopping') fields.innerHTML = commonName + field('장 본 날짜', 'date', 'date', current.date || today, { required: true }) + field('구매한 것', 'note', 'textarea', current.note || '', { full: true, placeholder: '우유, 달걀, 채소' });
        if (currentType === 'clothes') fields.innerHTML = commonName + field('구매한 날짜', 'date', 'date', current.date || today, { required: true }) + field('가격', 'amount', 'number', current.amount || '', { min: '0', hint: '선택' }) + field('메모', 'note', 'textarea', current.note || '', { full: true, placeholder: '브랜드, 사이즈' });
        if (currentType === 'food') fields.innerHTML = commonName + field('기한 종류', 'dateType', 'select', current.dateType || '소비기한', { options: [{ value: '소비기한', label: '소비기한' }, { value: '유통기한', label: '유통기한' }, { value: '권장 섭취일', label: '권장 섭취일' }] }) + field('기한 날짜', 'expiryDate', 'date', current.expiryDate || '', { required: true }) + field('등록일', 'date', 'date', current.date || today, { required: true }) + field('보관 메모', 'note', 'textarea', current.note || '', { full: true, placeholder: '냉장·냉동 보관 위치' });
        if (currentType === 'cosmetic') {
          const categories = [...new Set([...window.SalimCare.categories, current.category || current.cosmeticType].filter(Boolean))];
          const categoryOptions = categories.map(value => ({ value, label: value }));
          fields.innerHTML = commonName + field('제품 종류', 'cosmeticType', 'select', current.category || current.cosmeticType || '기타', { full: true, options: categoryOptions }) + field('개봉한 날짜', 'openedAt', 'date', current.openedAt || '', { hint: '선택' }) + field('제품 표시 개봉 후 사용기간', 'paoMonths', 'number', current.paoMonths || '', { min: '1', max: '120', hint: '개월 · 확인한 경우만', attrs: 'step="1"' }) + field('포장 사용기한', 'labelDate', 'date', current.labelDate || '', { hint: '선택' }) + field('메모', 'note', 'textarea', current.note || '', { full: true, placeholder: '제품 라벨·보관 메모' });
          updateCosmeticPreview();
        }
        fields.innerHTML += `<div class="field full"><label for="recordPhoto">사진 <span class="hint">선택 · 자동으로 용량을 줄여 저장</span></label><input id="recordPhoto" name="photo" type="file" accept="image/*"><div class="photo-preview" id="photoPreview">${current.photo ? `<img src="${escapeHtml(current.photo)}" alt="첨부 사진"><button type="button" class="secondary-button" data-remove-photo>사진 제거</button>` : ''}</div></div>`;
        document.getElementById('modalTitle').textContent = `${labels[currentType]} ${editingItem ? '수정' : '기록 추가'}`;
        document.querySelector('#recordForm button[type="submit"]').textContent = editingItem ? '수정 저장' : '기록 저장';
      }
      function updateCosmeticPreview() {
        const item = { openedAt: document.getElementById('openedAt')?.value || '', paoMonths: document.getElementById('paoMonths')?.value || '', labelDate: document.getElementById('labelDate')?.value || '' };
        const expiry = window.SalimCare.cosmeticExpiry(item, today);
        document.getElementById('calcPreview').innerHTML = `<span>◷</span><span>${expiry.due ? `관리 날짜 <b>${formatDate(expiry.due)}</b><br>${expiry.basis}` : '제품 표시 확인 필요'}<br>종류만으로 사용기한을 추정하지 않아요.</span>`;
      }
      async function compressImage(file) {
        if (!file) return '';
        if (!file.type.startsWith('image/')) throw new Error('image');
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('read'));
          reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('image'));
            image.onload = () => {
              const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
              canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', .78));
            };
            image.src = reader.result;
          };
          reader.readAsDataURL(file);
        });
      }
      async function saveForm(event) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (!String(data.get('name') || '').trim()) { showToast('이름을 입력해 주세요.'); document.getElementById('name').focus(); return; }
        const original = editingItem;
        const item = { ...(original || {}), id: original?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), kind: currentType, name: data.get('name').trim(), note: (data.get('note') || '').trim(), registeredAt: original?.registeredAt || today };
        if (currentType === 'laundry' || currentType === 'shopping' || currentType === 'clothes') item.date = data.get('date');
        if (currentType === 'clothes') item.amount = data.get('amount') || '';
        if (currentType === 'food') { item.date = data.get('date'); item.expiryDate = data.get('expiryDate'); item.dateType = data.get('dateType'); }
        if (currentType === 'cosmetic') { item.openedAt = data.get('openedAt'); item.paoMonths = data.get('paoMonths') ? Number(data.get('paoMonths')) : null; item.cosmeticType = data.get('cosmeticType'); item.category = item.cosmeticType; item.labelDate = data.get('labelDate') || ''; }
        const form = event.currentTarget;
        try {
          const photoFile = data.get('photo');
          if (photoFile?.size) item.photo = await compressImage(photoFile);
          records = [item, ...records.filter(x => x.id !== item.id)]; save(); closeModal(); render(); showToast(original ? '수정 내용을 저장했어요.' : '기록을 저장했어요.');
          form.reset();
        } catch (error) {
          showToast(error.message === 'image' ? '이미지 파일을 선택해 주세요.' : '저장하지 못했어요. 사진을 줄이거나 제거해 주세요.');
        }
      }
      function deleteRecord(id) {
        const item = records.find(x => x.id === id);
        if (!item || !window.confirm(`“${item.name}” 기록을 삭제할까요?`)) return;
        records = records.filter(x => x.id !== id); save(); render(); showToast('기록을 삭제했어요.');
      }
      function renderMedTimeInputs(times) {
        document.getElementById('medTimes').innerHTML = times.map((time, index) => `<div class="med-time-row"><input type="time" name="medTime" value="${escapeHtml(time)}" required aria-label="복용 시간 ${index + 1}"><button class="remove-time" type="button" data-remove-time aria-label="복용 시간 ${index + 1} 삭제">×</button></div>`).join('');
      }
      function openMedicationModal(med = null) {
        medicationReturnFocus = document.activeElement;
        editingMedicineId = med?.id || null;
        document.getElementById('medModalTitle').textContent = med ? '약 수정' : '약 추가';
        document.getElementById('saveMedicationButton').textContent = med ? '수정 저장' : '약 저장';
        document.getElementById('medName').value = med?.name || '';
        document.getElementById('medScheduled').checked = !med || Boolean(med.times?.length);
        document.getElementById('medDose').value = med?.dose || '';
        document.getElementById('medStartDate').value = med?.startDate || '';
        document.getElementById('medEndDate').value = med?.endDate || '';
        renderMedTimeInputs(med?.times?.length ? med.times : ['08:00']);
        updateScheduleFields();
        document.getElementById('dayPicker').innerHTML = weekdays.map((day, index) => `<label class="day-option"><input type="checkbox" name="medDay" value="${index}" ${(med?.days || [0,1,2,3,4,5,6]).includes(index) ? 'checked' : ''}><span>${day}</span></label>`).join('');
        document.getElementById('medModalBackdrop').classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('medName').focus(), 30);
      }
      function closeMedicationModal() {
        if (!document.getElementById('medModalBackdrop').classList.contains('open')) return;
        document.getElementById('medModalBackdrop').classList.remove('open');
        document.body.style.overflow = '';
        editingMedicineId = null;
        document.getElementById('medForm').reset();
        if (medicationReturnFocus?.isConnected) medicationReturnFocus.focus({ preventScroll: true });
        medicationReturnFocus = null;
      }
      function saveMedication(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        if (!String(data.get('name') || '').trim()) { showToast('약 이름을 입력해 주세요.'); document.getElementById('medName').focus(); return; }
        const scheduled = document.getElementById('medScheduled').checked;
        const times = scheduled ? [...new Set(data.getAll('medTime').filter(Boolean))].sort() : [];
        const days = data.getAll('medDay').map(Number).sort((a,b) => a-b);
        const startDate = data.get('startDate') || '';
        const endDate = data.get('endDate') || '';
        if (scheduled && !times.length) { showToast('복용 시간을 한 개 이상 입력해 주세요.'); return; }
        if (scheduled && !days.length) { showToast('복용 요일을 선택해 주세요.'); document.querySelector('#dayPicker input[name="medDay"]').focus(); return; }
        if (startDate && endDate && endDate < startDate) { showToast('종료일은 시작일 이후로 설정해 주세요.'); document.getElementById('medEndDate').focus(); return; }
        const old = medicines.find(m => m.id === editingMedicineId);
        const med = { ...(old || {}), id: old?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), name: String(data.get('name') || '').trim(), dose: String(data.get('dose') || '').trim(), times, days, startDate, endDate };
        medicines = old ? medicines.map(m => m.id === old.id ? med : m) : [...medicines, med];
        try { saveMedicines(); closeMedicationModal(); render(); showToast(old ? '약 정보를 수정했어요.' : '약을 추가했어요.'); checkNotifications(); }
        catch { showToast('저장 공간이 부족합니다.'); }
      }
      function deleteMedicine(id) {
        const med = medicines.find(m => m.id === id);
        if (!med || !window.confirm(`“${med.name}” 약과 일정을 삭제할까요? 복용 기록도 함께 지워집니다.`)) return;
        medicines = medicines.filter(m => m.id !== id);
        for (const key of Object.keys(medicationChecks)) if (key.startsWith(`${id}|`)) delete medicationChecks[key];
        try { saveMedicines(); saveChecks(); render(); showToast('약을 삭제했어요.'); }
        catch { showToast('삭제 내용을 저장하지 못했어요.'); }
      }
      function showPhoto(id) {
        const item = records.find(x => x.id === id);
        if (!item?.photo) return;
        document.getElementById('photoViewerImage').src = item.photo;
        document.getElementById('photoViewer').classList.add('open');
      }
      function closePhoto() { document.getElementById('photoViewer').classList.remove('open'); document.getElementById('photoViewerImage').removeAttribute('src'); }
      function exportData() {
        const blob = new Blob([JSON.stringify({ app: '살림 기록', version: 3, exportedAt: new Date().toISOString(), records, medicines, medicationChecks, routines, shoppingList, todayState: bridge.current(), previousStorage: bridge.backup() }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `살림기록-백업-${today}.json`; a.click(); URL.revokeObjectURL(url); showToast('백업 파일을 만들었어요.');
      }
      async function importData(file) {
        try {
          const parsed = JSON.parse(await file.text());
          bridge.importBackup(parsed);
          records = bridge.records(); medicines = bridge.medicines(); medicationChecks = bridge.checks();
          routines = bridge.previous('routines'); shoppingList = bridge.previous('shoppingList');
          render(); showToast('백업을 가져왔어요. 같은 항목은 현재 기록을 유지했어요.');
        } catch { showToast('가져오지 못했어요. 백업 파일과 다른 화면의 변경을 확인해 주세요.'); }
      }

      document.querySelectorAll('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
      document.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.openView)));
      document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.add)));
      document.getElementById('openAdd').addEventListener('click', () => {
        if (currentView === 'medications') return openMedicationModal();
        if (currentView === 'routines') { document.getElementById('routineName').focus(); return; }
        openModal(currentView === 'laundry' || currentView === 'shopping' || currentView === 'clothes' || currentView === 'food' || currentView === 'expiry' ? ({ expiry: 'food' }[currentView] || currentView) : 'laundry');
      });
      document.getElementById('listAdd').addEventListener('click', () => openModal(currentView === 'expiry' ? 'food' : (['laundry','shopping','clothes','food'].includes(currentView) ? currentView : 'laundry')));
      document.getElementById('shoppingItemInput').addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); addShoppingListItem(); }
      });
      document.getElementById('addShoppingItem').addEventListener('click', addShoppingListItem);
      document.getElementById('shoppingItems').addEventListener('change', event => {
        const input = event.target.closest('[data-shopping-toggle]');
        if (!input) return;
        const item = shoppingList.find(entry => entry.id === input.dataset.shoppingToggle);
        if (!item) return;
        const keepFocus = document.activeElement === input;
        item.done = input.checked; saveShoppingList(); renderShoppingList();
        if (keepFocus) [...document.querySelectorAll('[data-shopping-toggle]')].find(control => control.dataset.shoppingToggle === item.id)?.focus();
      });
      document.getElementById('shoppingItems').addEventListener('click', event => {
        const button = event.target.closest('[data-shopping-remove]');
        if (!button) return;
        const keepFocus = document.activeElement === button;
        const buttons = [...document.querySelectorAll('[data-shopping-remove]')];
        const index = buttons.indexOf(button);
        shoppingList = shoppingList.filter(item => item.id !== button.dataset.shoppingRemove);
        saveShoppingList(); renderShoppingList();
        if (keepFocus) (document.querySelectorAll('[data-shopping-remove]')[Math.min(index, shoppingList.length - 1)] || document.getElementById('shoppingItemInput')).focus();
      });
      document.getElementById('saveShoppingPurchase').addEventListener('click', saveCheckedShoppingItems);
      document.getElementById('routineForm').addEventListener('submit', saveRoutine);
      document.getElementById('routineList').addEventListener('click', event => {
        const edit = event.target.closest('[data-routine-edit]');
        const done = event.target.closest('[data-routine-done]');
        const remove = event.target.closest('[data-routine-delete]');
        if (edit) editRoutine(edit.dataset.routineEdit);
        else if (done) completeRoutine(done.dataset.routineDone);
        else if (remove) deleteRoutine(remove.dataset.routineDelete);
      });
      document.getElementById('exportCalendar').addEventListener('click', exportCalendar);
      document.getElementById('closeModal').addEventListener('click', closeModal);
      document.getElementById('cancelModal').addEventListener('click', closeModal);
      document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
      document.getElementById('typeTabs').addEventListener('click', e => { const tab = e.target.closest('[data-type]'); if (tab) { currentType = tab.dataset.type; updateTabs(); renderForm(); } });
      document.getElementById('recordForm').addEventListener('submit', saveForm);
      document.getElementById('formFields').addEventListener('input', e => { if (['openedAt','paoMonths','labelDate','cosmeticType'].includes(e.target.name)) updateCosmeticPreview(); });
      document.getElementById('formFields').addEventListener('change', e => {
        if (e.target.name === 'cosmeticType') updateCosmeticPreview();
        if (['openedAt','paoMonths','labelDate'].includes(e.target.name)) updateCosmeticPreview();
        if (e.target.name === 'photo') {
          const file = e.target.files?.[0];
          const target = document.getElementById('photoPreview');
          if (file) {
            const url = URL.createObjectURL(file);
            target.innerHTML = `<img src="${url}" alt="선택한 사진 미리보기"><button type="button" class="secondary-button" data-clear-photo>선택 취소</button>`;
          }
        }
      });
      document.getElementById('searchInput').addEventListener('input', renderList);
      document.getElementById('sortSelect').addEventListener('change', renderList);
      document.getElementById('recordList').addEventListener('click', e => {
        const photo = e.target.closest('[data-photo]');
        const edit = e.target.closest('[data-edit]');
        const remove = e.target.closest('[data-delete]');
        if (photo) showPhoto(photo.dataset.photo);
        else if (edit) { const item = records.find(x => x.id === edit.dataset.edit); if (item) openModal(item.kind, item); }
        else if (remove) deleteRecord(remove.dataset.delete);
      });
      document.getElementById('recordForm').addEventListener('click', e => {
        if (e.target.closest('[data-remove-photo]')) {
          if (editingItem) editingItem.photo = '';
          const input = document.getElementById('recordPhoto'); if (input) input.value = '';
          document.getElementById('photoPreview').textContent = '';
        } else if (e.target.closest('[data-clear-photo]')) {
          document.getElementById('recordPhoto').value = '';
          const preview = document.getElementById('photoPreview');
          preview.innerHTML = editingItem?.photo ? `<img src="${escapeHtml(editingItem.photo)}" alt="첨부 사진"><button type="button" class="secondary-button" data-remove-photo>사진 제거</button>` : '';
        }
      });
      document.getElementById('notificationButton').addEventListener('click', toggleNotifications);
      document.getElementById('addMedication').addEventListener('click', () => openMedicationModal());
      document.getElementById('closeMedModal').addEventListener('click', closeMedicationModal);
      document.getElementById('cancelMedModal').addEventListener('click', closeMedicationModal);
      document.getElementById('medModalBackdrop').addEventListener('click', e => { if (e.target.id === 'medModalBackdrop') closeMedicationModal(); });
      document.getElementById('medForm').addEventListener('submit', saveMedication);
      function updateScheduleFields() {
        const scheduled = document.getElementById('medScheduled').checked;
        document.querySelectorAll('#medTimes input').forEach(input => { input.disabled = !scheduled; input.required = scheduled; });
        document.getElementById('addMedTime').disabled = !scheduled;
      }
      document.getElementById('medScheduled').addEventListener('change', updateScheduleFields);
      document.getElementById('addMedTime').addEventListener('click', () => {
        const times = [...document.querySelectorAll('input[name="medTime"]')].map(input => input.value).filter(Boolean);
        const nextTime = ['20:00', '12:00', '18:00', '09:00'].find(time => !times.includes(time)) || '12:00';
        times.push(nextTime); renderMedTimeInputs(times);
        document.querySelector('#medTimes .med-time-row:last-child input').focus();
      });
      document.getElementById('medTimes').addEventListener('click', e => {
        if (!e.target.closest('[data-remove-time]')) return;
        const rows = [...document.querySelectorAll('.med-time-row')];
        if (rows.length <= 1) { showToast('복용 시간은 한 개 이상 필요합니다.'); return; }
        const row = e.target.closest('.med-time-row');
        const nextInput = (row.nextElementSibling || row.previousElementSibling)?.querySelector('input');
        row.remove();
        document.querySelectorAll('#medTimes .med-time-row').forEach((row, index) => {
          row.querySelector('input').setAttribute('aria-label', `복용 시간 ${index + 1}`);
          row.querySelector('[data-remove-time]').setAttribute('aria-label', `복용 시간 ${index + 1} 삭제`);
        });
        nextInput?.focus();
      });
      const doseClick = e => { const button = e.target.closest('[data-dose-id]'); if (button) toggleDose(button.dataset.doseId, button.dataset.doseTime); };
      document.getElementById('dashboardDoseList').addEventListener('click', doseClick);
      document.getElementById('medDoseList').addEventListener('click', doseClick);
      document.getElementById('medList').addEventListener('click', e => {
        const edit = e.target.closest('[data-edit-med]'); const remove = e.target.closest('[data-delete-med]');
        if (edit) { const med = medicines.find(x => x.id === edit.dataset.editMed); if (med) openMedicationModal(med); }
        else if (remove) deleteMedicine(remove.dataset.deleteMed);
      });
      document.getElementById('photoViewer').addEventListener('click', e => { if (e.target.id === 'photoViewer' || e.target.id === 'closePhotoViewer') closePhoto(); });
      document.getElementById('closePhotoViewer').addEventListener('click', closePhoto);
      document.getElementById('exportButton').addEventListener('click', exportData);
      document.getElementById('backupInline').addEventListener('click', exportData);
      document.getElementById('mobileExportButton').addEventListener('click', exportData);
      document.getElementById('mobileImportButton').addEventListener('click', () => document.getElementById('importFile').click());
      document.getElementById('importButton').addEventListener('click', () => document.getElementById('importFile').click());
      document.getElementById('importFile').addEventListener('change', e => { const file = e.target.files?.[0]; if (file) importData(file); e.target.value = ''; });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeModal(); closeMedicationModal(); closePhoto(); }
        if (e.key !== 'Tab') return;
        const dialog = document.querySelector('.modal-backdrop.open');
        if (!dialog) return;
        const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
          .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) return;
        if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          e.preventDefault(); first.focus();
        }
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkNotifications(); renderMedications(); } });
      setInterval(() => { checkNotifications(); renderMedications(); }, 60 * 1000);
      const allowedViews = ['overview', 'expiry', 'food', 'medications', 'laundry', 'shopping', 'clothes', 'routines', 'all'];
      switchView(allowedViews.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'shopping');
      window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
      checkNotifications();
    })();
