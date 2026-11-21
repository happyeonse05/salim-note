(() => {
  'use strict';
  const C = window.SalimCore;
  const H = window.SalimCare;
  const KEY = 'oneul-salim-v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => Number(value).toLocaleString('ko-KR');
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeText = value => { if (typeof value !== 'string' && !(value instanceof Date)) return ''; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''; };
  const dateText = value => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(value + 'T12:00:00'));
  const localInput = value => { const d = new Date(value); return `${C.day(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  let blocked = false;
  function read(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
    catch { if (key === KEY) blocked = true; return fallback; }
  }
  const oldRecords = read('salimnote-records-v1', []);
  const legacy = {
    records: Array.isArray(oldRecords) ? oldRecords : [],
    routines: read('salimnote-routines-v1', []), shoppingList: read('salimnote-shopping-list-v1', [])
  };
  const initial = C.initialState(read('salimnote-medicines-v1', []), read('salimnote-med-checks-v1', {}), legacy.records);
  initial.cosmetics = legacy.records.filter(x => x.kind === 'cosmetic').map(x => ({ ...x, id: `legacy:${x.id}`, category: x.cosmeticType || '기타', legacy: true }));
  function loadState() {
    const saved = read(KEY, null);
    if (!saved) return structuredClone(initial);
    if ((saved.cosmetics !== undefined && !Array.isArray(saved.cosmetics)) || saved.version !== 1 || !Array.isArray(saved.timers) || !Array.isArray(saved.expenses) || !Array.isArray(saved.medicines) || !saved.checks || typeof saved.checks !== 'object' || Array.isArray(saved.checks)) {
      blocked = true; return structuredClone(initial);
    }
    return { ...structuredClone(initial), ...saved };
  }
  let state = loadState();
  let screen = 'today', kind = '', editingId = null, filter = 'all';
  let shownDate = C.day(new Date()), toastTimer, undoAction = null;
  function announce(message, undo = null) {
    clearTimeout(toastTimer); $('toastText').textContent = message; undoAction = undo;
    $('toastUndo').hidden = !undo; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; undoAction = null; }, 7000);
  }
  function persist(next) {
    if (blocked) { announce('저장 데이터를 먼저 백업해 주세요. 덮어쓰지 않았어요.'); return false; }
    try { localStorage.setItem(KEY, JSON.stringify(next)); state = next; return true; }
    catch { announce('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); return false; }
  }
  if (blocked) { $('storageError').hidden = false; $('storageError').textContent = '저장 데이터를 읽지 못했어요. 원본은 덮어쓰지 않았습니다. 지난 기록에서 먼저 백업해 주세요.'; }
  function go(next, focus = true) {
    screen = next;
    for (const name of ['today', 'add', 'history']) $(name + 'View').hidden = name !== next;
    document.querySelectorAll('[data-screen]').forEach(button => { if (button.dataset.screen === next) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    if (next === 'today') renderToday();
    if (next === 'history') renderHistory();
    if (next === 'add') { renderQuickEntries(); kind = ''; editingId = null; $('entryForm').hidden = true; $('addTitle').textContent = '무엇을 기록할까요?'; updateTypes(); }
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (focus) { const heading = $(next === 'today' ? 'todayTitle' : next === 'add' ? 'addTitle' : 'historyTitle'); heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }
  function row(title, meta, actions = '', attrs = '') {
    return `<div class="row" ${attrs}><div class="row-copy"><div class="row-title">${title}</div>${meta ? `<div class="row-meta">${meta}</div>` : ''}</div>${actions ? `<div class="row-actions">${actions}</div>` : ''}</div>`;
  }
  function weekMarkup(link = true) {
    const total = C.weeklyTotal(state.expenses), range = C.weekRange();
    let detail = `${Number(range.start.slice(5, 7))}.${Number(range.start.slice(8))}부터 · 월요일 기준`;
    if (Number.isSafeInteger(state.budget) && state.budget > 0) detail = state.budget >= total ? `예산 ${money(state.budget)}원 중 ${money(state.budget - total)}원 남음` : `예산보다 ${money(total - state.budget)}원 더 썼어요`;
    const content = `<span><span class="weekly-title">이번 주 <strong>${money(total)}원</strong> 썼어요</span><span class="weekly-detail">${esc(detail)}</span></span>`;
    return link ? `<button class="weekly-link" data-open-expenses>${content}<span class="detail-cue">내역 보기</span></button>` : `<div class="history-total">${content}</div>`;
  }
  function renderToday() {
    const now = new Date(), date = C.day(now); shownDate = date;
    $('todayTitle').textContent = dateText(date).replace('요일', '');
    const active = [], completed = [];
    for (const timer of state.timers) {
      const status = C.timerStatus(timer);
      if (status.state === 'running' || status.state === 'ready') {
        const title = H.laundryTitle(timer, date);
        const meta = status.state === 'ready' ? '설정한 시간 기준' : `${timeText(timer.endsAtDate || new Date(timer.endsAt).toISOString())} 종료 예정`;
        const action = status.state === 'ready' ? `<button class="plain" data-hang="${esc(timer.id)}">널었어</button>` : `<button class="subtle-button" data-cancel-timer="${esc(timer.id)}" aria-label="빨래 타이머 취소">취소</button>`;
        active.push({ rank: status.state === 'ready' ? 0 : 1, at: timer.endsAt, html: row(`<span data-timer-text="${esc(timer.id)}">${title}</span>`, meta, action) });
      }
      if (timer.hungAt && C.day(timer.hungAt) === date) completed.push({ at: timer.hungAt, html: row('빨래 · 널었어', `${timeText(timer.hungAt)}에 기록`, `<button class="subtle-button" data-undo-hang="${esc(timer.id)}">취소</button>`) });
    }
    for (const dose of C.doses(state.medicines, state.checks, now)) {
      if (dose.checkedAt) {
        completed.push({ at: dose.checkedAt, html: row(`${esc(dose.med.name)} · ${timeText(dose.checkedAt) ? `${timeText(dose.checkedAt)}에 먹음` : '복용 기록 있음'}`, `예정 ${dose.time} · 내가 체크한 기록`, `<button class="subtle-button" data-undo-dose="${esc(dose.key)}" aria-label="${esc(dose.med.name)} 복용 기록 취소">취소</button>`) });
      } else active.push({ rank: 2, at: dose.time, html: row(esc(dose.med.name), `${lastRecordText(dose.med.id)}${drugGuide(dose.med)}`, `<button class="plain" data-check="${esc(dose.key)}" aria-label="${esc(dose.med.name)} ${dose.time} 복용 기록">기록</button>`) });
    }
    for (const med of state.medicines.filter(m => !m.times?.length)) {
      for (const [key, at] of Object.entries(state.checks)) if (key.split('|')[0] === String(med.id) && C.day(at) === date) completed.push({ at, html: row(esc(med.name), `${timeText(at)}에 남긴 기록${drugGuide(med)}`, `<button class="subtle-button" data-undo-dose="${esc(key)}">취소</button>`) });
    }
    active.sort((a, b) => a.rank - b.rank || String(a.at).localeCompare(String(b.at)));
    $('activeRows').innerHTML = active.map(x => x.html).join(''); $('activeRows').hidden = !active.length;
    $('todayIntro').textContent = active.length ? '진행 중인 일부터 확인하세요.' : completed.length ? '오늘 남긴 기록을 바로 확인하세요.' : '';
    renderCosmeticSummary();
    const usesExpenses = Boolean(state.expenses.length || state.budget);
    $('weeklySummary').hidden = !usesExpenses; $('weeklySummary').innerHTML = usesExpenses ? weekMarkup() : '';
    completed.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    $('completedRows').innerHTML = completed.map(x => x.html).join(''); $('completedSection').hidden = !completed.length;
    $('emptyToday').hidden = Boolean(active.length || completed.length || state.expenses.length || state.budget || !$('cosmeticSummary').hidden);
  }
  function historyEntries() {
    const entries = [];
    state.expenses.forEach(item => entries.push({ type: 'expense', at: item.at, html: row(`${esc(item.note || '지출')} · ${money(item.amount)}원`, item.dateOnly ? '이전 앱에서 이어진 기록' : timeText(item.at), `<button class="small-button" data-edit-expense="${esc(item.id)}" aria-label="${esc(item.note || '지출')} 수정">수정</button>`) }));
    state.timers.filter(item => item.hungAt).forEach(item => entries.push({ type: 'laundry', at: item.hungAt, html: row('빨래 · 널었어', `${timeText(item.hungAt)}에 기록 · 설정 ${item.minutes}분`, `<button class="subtle-button" data-undo-hang="${esc(item.id)}">취소</button>`) }));
    Object.entries(state.checks).forEach(([key, at]) => {
      const parts = key.split('|'), med = state.medicines.find(x => String(x.id) === parts[0]);
      if (!C.day(at)) return;
      entries.push({ type: 'medicine', at, html: row(`${esc(med?.name || '복용 기록')} · ${timeText(at)}에 먹음`, `내가 체크한 시각 · 예정 ${esc(parts.at(-1) || '')}`, `<button class="subtle-button" data-undo-dose="${esc(key)}">취소</button>`) });
    });
    return entries.filter(x => filter === 'all' || x.type === filter).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function renderHistory() {
    $('historyWeek').innerHTML = filter === 'expense' ? weekMarkup(false) : '';
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    const entries = historyEntries(); let previousDate = '';
    $('historyRows').innerHTML = entries.length ? entries.map(item => {
      const date = C.day(item.at); const heading = date !== previousDate ? `${previousDate ? '</div>' : ''}<h2 class="history-date">${esc(dateText(date))}</h2><div class="history-group">` : ''; previousDate = date;
      return heading + item.html;
    }).join('') + '</div>' : `<p class="quiet-empty">${({ all: '아직 남긴 기록이 없어요.', expense: '아직 남긴 지출이 없어요.', medicine: '아직 복용 체크 기록이 없어요.', laundry: '아직 빨래를 넌 기록이 없어요.' })[filter]}</p>`;
    $('medicineSettings').innerHTML = state.medicines.length ? state.medicines.map(med => row(esc(med.name), `${esc((med.times || []).join(' · '))}${Array.isArray(med.days) && med.days.length < 7 ? ' · 등록한 요일에 표시' : ''}`, `<button class="small-button" data-edit-med="${esc(med.id)}">수정</button><button class="small-button" data-notify-med="${esc(med.id)}" aria-pressed="${Boolean(state.notifyMeds[med.id])}">알림 ${state.notifyMeds[med.id] ? '켜짐' : '꺼짐'}</button>`)).join('') : '<p class="small-note">등록한 약이 없어요.</p>';
    $('budgetAmount').value = state.budget || '';
    renderCosmetics();
    renderPrevious();
  }
  function renderPrevious() {
    const old = legacy.records, routines = Array.isArray(legacy.routines) ? legacy.routines : [], shopping = Array.isArray(legacy.shoppingList) ? legacy.shoppingList : [];
    $('previousSection').hidden = !(old.length || routines.length || shopping.length);
    const labels = { laundry: '빨래', shopping: '장보기', clothes: '옷 구매', food: '식품', cosmetic: '화장품' };
    $('previousRows').innerHTML = [...old].reverse().map(item => row(esc(item.name || labels[item.kind] || '기록'), esc([labels[item.kind], item.date || item.openedAt || item.registeredAt, item.note, item.expiryDate ? `표시 기한 ${item.expiryDate}` : '', item.labelDate ? `표시 기한 ${item.labelDate}` : '', item.paoMonths ? `등록된 개봉 후 ${item.paoMonths}개월` : ''].filter(Boolean).join(' · ')) + (item.photo && /^data:image\//.test(item.photo) ? `<br><img class="previous-photo" src="${esc(item.photo)}" alt="${esc(item.name)} 첨부 사진">` : ''))).join('') + routines.map(item => row(esc(item.name), `이전 반복 일정 · ${esc(item.nextDate || '')}`)).join('') + shopping.map(item => row(esc(item.name), item.done ? '이전 장보기 · 체크됨' : '이전 장보기 · 살 물건')).join('');
  }
  function updateTypes() { document.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind))); }
  function chooseKind(nextKind, id = null) {
    $('quickSection').hidden = true; $('quickExpenseForm').hidden = true;
    kind = nextKind; editingId = id; updateTypes(); $('entryForm').hidden = false;
    $('saveEntry').textContent = id ? '수정 저장' : kind === 'laundry' ? '시작' : '저장';
    $('addTitle').textContent = id ? ({ expense: '지출 수정', medicine: '약 수정', cosmetic: '화장품 수정' }[kind]) : ({ laundry: '빨래 시간 정하기', medicine: '약 등록', expense: '지출 기록', cosmetic: '화장품 등록' }[kind]);
    if (kind === 'laundry') $('formFields').innerHTML = '<label for="minutes">몇 분 뒤에 확인할까요?</label><div class="inline-form"><input id="minutes" name="minutes" type="number" inputmode="numeric" min="1" max="1440" step="1" value="45" required><span>분</span></div><div class="presets"><button type="button" data-minutes="30">30분</button><button type="button" data-minutes="45">45분</button><button type="button" data-minutes="60">60분</button></div><label class="check-label"><input id="notifyTimer" type="checkbox">설정한 시간이 되면 알림 받기</label><p class="small-note">세탁기와 연결된 타이머가 아니에요.<br>앱을 닫아도 남은 시간은 이어져요. 웹 알림은 앱이 열려 있을 때 받을 수 있어요.</p>';
    if (kind === 'expense') {
      const item = state.expenses.find(x => x.id === id);
      $('formFields').innerHTML = `<label for="amount">얼마 썼나요?</label><div class="amount-wrap"><input id="amount" name="amount" type="text" inputmode="numeric" maxlength="11" value="${item?.amount || ''}" placeholder="0" required autocomplete="off"><span>원</span></div><label for="expenseNote">메모 <span class="optional">선택</span></label><input id="expenseNote" name="note" maxlength="100" placeholder="메모 없이 저장해도 돼요" value="${esc(item?.note || '')}">${item ? `<label for="expenseAt">쓴 ${item.dateOnly ? '날짜' : '시각'}</label><input id="expenseAt" type="${item.dateOnly ? 'date' : 'datetime-local'}" required value="${item.dateOnly ? C.day(item.at) : localInput(item.at)}">` : ''}`;
    }
    if (kind === 'medicine') $('formFields').innerHTML = medicineFields(state.medicines.find(x => x.id === id));
    if (kind === 'cosmetic') $('formFields').innerHTML = cosmeticFields((state.cosmetics || []).find(x => x.id === id));
    if (kind === 'cosmetic') previewCosmetic();
    $('formFields').querySelector('input')?.focus();
  }
  function lastRecordText(id) {
    const at = H.lastCheck(state.checks, id);
    if (!at) return '내가 남긴 기록 없음';
    const d = C.day(at), today = C.day(new Date());
    return `마지막 기록 · ${d === today ? '오늘' : `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`} ${timeText(at)}`;
  }
  function drugGuide(med) {
    const p = H.products.find(x => x.id === med.productId);
    const notes = [med.fastBeforeMinutes != null ? `식사 후 ${med.fastBeforeMinutes}분 공복 유지` : '', med.fastAfterMinutes != null ? `복용 후 식사까지 ${med.fastAfterMinutes}분` : '', med.mealNote].filter(Boolean);
    if (!p && !notes.length) return '';
    return `<details class="drug-guide"><summary>식사·공복 안내</summary>${p ? `<p>${esc(p.ingredient)}</p><p>${esc(p.meal)}</p><p>${esc(p.interval)}</p><p>${esc(p.caution)}</p><p class="source-links">${p.sources.map(([name, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`).join(' · ')} · 확인 ${H.verifiedAt}</p>` : '<p>자동 안내가 없는 제품이에요. 제품 설명서나 약사가 안내한 내용을 확인하세요.</p>'}${notes.length ? `<p>직접 확인해 남긴 안내: ${notes.map(esc).join(' · ')}</p>` : ''}<p>일반 제품 정보이며 개인별 복용 가능 여부를 판단하지 않아요. 처방·약사 안내가 있으면 그 내용을 따르세요.</p></details>`;
  }
  function medicineFields(med) {
    const scheduled = med ? Boolean(med.times?.length) : true;
    return `<label for="medicineProduct">정확한 제품</label><select id="medicineProduct"><option value="">직접 등록 · 약 봉투 안내 입력</option>${H.products.map(p => `<option value="${p.id}" ${med?.productId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><p class="small-note">자동 안내는 위 3개 제품을 지원해요. 같은 이름도 함량·제형을 확인하세요.</p><div id="productPreview">${drugGuide(med || {})}</div><label for="medicineName">이름 또는 별칭</label><input id="medicineName" maxlength="80" required value="${esc(med?.name || '')}" placeholder="예: 저녁 약"><details class="settings"><summary>약 봉투·약사에게 확인한 식사 조건</summary><label for="fastBefore">식사 후 복용 전 공복 유지 <span class="optional">분 · 안내받은 경우만</span></label><input id="fastBefore" type="number" min="0" max="1440" step="1" value="${med?.fastBeforeMinutes ?? ''}" placeholder="확인되지 않으면 비워 두세요"><label for="fastAfter">복용 후 다음 식사까지 <span class="optional">분 · 안내받은 경우만</span></label><input id="fastAfter" type="number" min="0" max="1440" step="1" value="${med?.fastAfterMinutes ?? ''}" placeholder="예: 30"><label for="mealNote">함께 먹을 것·피할 것 등 안내 메모</label><input id="mealNote" maxlength="500" value="${esc(med?.mealNote || '')}" placeholder="약 봉투 또는 약사에게 들은 내용"></details><label class="check-label"><input id="dailyMedicine" type="checkbox" ${scheduled ? 'checked' : ''}>정한 시간에 홈에 표시</label><div id="medicineSchedule" ${scheduled ? '' : 'hidden'}><div id="timeInputs">${(med?.times?.length ? med.times : ['08:00']).map((time, i) => timeField(time, i)).join('')}</div><button type="button" class="text-link" id="moreTime">시간 추가</button><label class="check-label"><input id="notifyMedicine" type="checkbox" ${state.notifyMeds[med?.id] ? 'checked' : ''}>이 약의 알림 받기</label></div><p class="small-note">필요할 때만 먹는 약은 시간 표시를 끄세요. 복용 기록은 ＋에서 남길 수 있어요.</p>`;
  }
  function optionalMinutes(id) { const v = $(id).value; return v === '' ? null : Number(v); }
  function cosmeticFields(item) {
    return `<label for="cosmeticName">제품명</label><input id="cosmeticName" maxlength="100" required value="${esc(item?.name || '')}" placeholder="예: 데일리 선크림"><label for="cosmeticCategory">종류</label><select id="cosmeticCategory">${H.categories.map(c => `<option ${item?.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><label for="cosmeticOpened">개봉일 <span class="optional">미개봉이면 비워 두세요</span></label><input id="cosmeticOpened" type="date" max="${C.day(new Date())}" value="${esc(item?.openedAt || '')}"><label for="cosmeticPao">제품에 표시된 개봉 후 사용기간</label><select id="cosmeticPao"><option value="">아직 확인하지 못했어요</option>${[3, 6, 9, 12, 18, 24, 36, ...([3,6,9,12,18,24,36].includes(Number(item?.paoMonths)) || !item?.paoMonths ? [] : [Number(item.paoMonths)])].sort((a,b) => a-b).map(n => `<option value="${n}" ${Number(item?.paoMonths) === n ? 'selected' : ''}>${n}M · 개봉 후 ${n}개월</option>`).join('')}</select><label for="cosmeticLabel">포장에 적힌 사용기한 <span class="optional">표시된 경우</span></label><input id="cosmeticLabel" type="date" value="${esc(item?.labelDate || '')}"><div id="cosmeticPreview" class="expiry-preview" role="status"></div><p class="small-note">종류만으로 기한을 정하지 않아요. 용기의 열린 뚜껑 표시(6M·12M 등)와 사용기한을 옮겨 주세요. 계산일은 사용 안전성을 보장하지 않아요. <a href="https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&amp;joBrNo=00&amp;joNo=0010&amp;lsiSeq=291337&amp;urlMode=lsScJoRltInfoR" target="_blank" rel="noopener noreferrer">제품 표시 기준</a></p><label for="cosmeticNote">메모 <span class="optional">선택</span></label><input id="cosmeticNote" maxlength="300" value="${esc(item?.note || '')}">`;
  }
  function cosmeticFromForm() { return { name: $('cosmeticName').value.trim(), category: $('cosmeticCategory').value, openedAt: $('cosmeticOpened').value, paoMonths: $('cosmeticPao').value ? Number($('cosmeticPao').value) : null, labelDate: $('cosmeticLabel').value, note: $('cosmeticNote').value.trim() }; }
  function previewCosmetic() {
    const e = H.cosmeticExpiry(cosmeticFromForm());
    $('cosmeticPreview').textContent = e.due ? `관리 날짜 ${e.due} · ${e.basis}${e.days < 0 ? ' · 날짜 지남' : ` · ${e.days}일 남음`}` : '기한 미확인 · 표시된 기간과 날짜를 입력하면 계산돼요.';
  }
  function cosmeticStatus(item) { const e = H.cosmeticExpiry(item); return item.finishedAt ? '사용 완료' : !e.due ? '기한 미확인' : `${e.due} · ${e.days < 0 ? `${Math.abs(e.days)}일 지남` : e.days === 0 ? '오늘까지' : `${e.days}일 남음`}`; }
  function renderCosmeticSummary() {
    const items = (state.cosmetics || []).filter(x => !x.finishedAt && (H.cosmeticExpiry(x).days === null || H.cosmeticExpiry(x).days <= 30)).sort((a,b) => (H.cosmeticExpiry(a).due || '9999').localeCompare(H.cosmeticExpiry(b).due || '9999'));
    $('cosmeticSummary').hidden = !items.length;
    $('cosmeticSummary').innerHTML = items.slice(0, 3).map(x => row(esc(x.name), esc(cosmeticStatus(x)), `<button class="small-button" data-edit-cosmetic="${esc(x.id)}">보기</button>`)).join('');
  }
  function renderCosmetics() {
    const items = state.cosmetics || [];
    $('cosmeticItems').innerHTML = items.length ? items.map(x => row(esc(x.name), `${esc(x.category || x.cosmeticType || '화장품')} · ${esc(cosmeticStatus(x))}${x.legacy ? ' · 이전 등록값' : ''}`, `<button class="small-button" data-edit-cosmetic="${esc(x.id)}">수정</button><button class="small-button" data-finish-cosmetic="${esc(x.id)}">${x.finishedAt ? '다시 사용' : '다 썼어요'}</button>`)).join('') : '<p class="small-note">등록한 화장품이 없어요.</p>';
  }
  function renderQuickEntries() {
    $('quickSection').hidden = false; $('quickExpenseForm').hidden = false;
    const today = C.day(new Date()), yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const timers = H.laundrySuggestions(state.timers);
    const laundry = timers.map(t => { const running = state.timers.some(x => x.minutes === t.minutes && ['running','ready'].includes(C.timerStatus(x).state)); return `<button type="button" class="quick-entry" data-quick-laundry="${t.minutes}" ${running ? 'disabled' : ''}><strong>일반 빨래 ${t.minutes}분</strong><span>${running ? '홈에서 진행 중' : C.day(t.at) === C.day(yesterday) ? '어제 사용 · 바로 시작' : t.count ? '자주 사용 · 바로 시작' : '바로 시작'}</span></button>`; }).join('');
    const doseButtons = C.doses(state.medicines, state.checks).filter(x => !x.checkedAt).slice(0, 3).map(d => `<button type="button" class="quick-entry" data-quick-dose="${esc(d.key)}"><strong>${esc(d.med.name)} · 기록</strong><span>${lastRecordText(d.med.id)}</span></button>`).join('');
    const asNeeded = state.medicines.filter(m => !m.times?.length).slice(0, 3).map(m => `<button type="button" class="quick-entry" data-quick-dose="${esc(m.id)}|${today}|필요시-${Date.now()}"><strong>${esc(m.name)} · 기록</strong><span>${lastRecordText(m.id)}</span></button>`).join('');
    const unique = [...state.expenses].sort((a,b) => String(b.at).localeCompare(String(a.at))).filter((x,i,all) => all.findIndex(y => y.amount === x.amount && y.note === x.note) === i).slice(0, 2);
    $('quickEntries').innerHTML = laundry + doseButtons + asNeeded + unique.map(x => `<button type="button" class="quick-entry" data-quick-expense="${esc(x.id)}"><strong>${esc(x.note || '지출')} · ${money(x.amount)}원</strong><span>금액 확인 후 저장</span></button>`).join('');
    $('quickAmount').value = '';
  }
  function quickLaundry(minutes) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || state.timers.some(x => x.minutes === minutes && ['running','ready'].includes(C.timerStatus(x).state))) return;
    const recent = H.laundrySuggestions(state.timers).find(x => x.minutes === minutes), now = Date.now();
    const notify = Boolean(recent?.notify && 'Notification' in window && Notification.permission === 'granted');
    if (persist({ ...state, timers: [...state.timers, { id: uid(), minutes, startedAt: new Date(now).toISOString(), endsAt: now + minutes * 60000, hungAt: null, notify }] })) { go('today'); announce('빨래 타이머를 시작했어요.'); }
  }
  $('quickExpenseForm').addEventListener('submit', event => {
    event.preventDefault(); const amount = C.parseAmount($('quickAmount').value); if (!amount) { announce('1원 이상 숫자로 입력해 주세요.'); $('quickAmount').focus(); return; }
    if (persist({ ...state, expenses: [...state.expenses, { id: uid(), amount, note: '', at: new Date().toISOString() }] })) { go('today'); announce('지출을 저장했어요.'); }
  });
  $('newCosmetic').addEventListener('click', () => { go('add', false); chooseKind('cosmetic'); });
  $('formFields').addEventListener('input', () => { if (kind === 'cosmetic') previewCosmetic(); });
  $('formFields').addEventListener('change', event => {
    if (kind === 'cosmetic') previewCosmetic();
    if (event.target.id === 'dailyMedicine') $('medicineSchedule').hidden = !event.target.checked;
    if (event.target.id === 'medicineProduct') {
      const product = H.products.find(p => p.id === event.target.value);
      $('productPreview').innerHTML = drugGuide({ productId: product?.id });
      $('productPreview').querySelector('details')?.setAttribute('open', '');
      if (product && !editingId) { $('medicineName').value = product.name; $('dailyMedicine').checked = false; $('medicineSchedule').hidden = true; }
    }
  });
  function timeField(time = '', index = 0) { return `<div class="time-entry"><input type="time" name="medicineTime" aria-label="복용 시간 ${index + 1}" value="${esc(time)}"><button type="button" class="small-button" data-remove-time aria-label="복용 시간 삭제">삭제</button></div>`; }
  async function permission(wanted) {
    if (!wanted) return false;
    if (!('Notification' in window)) { announce('이 브라우저는 웹 알림을 지원하지 않아요.'); return false; }
    try { const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); if (result !== 'granted') announce('알림 없이 저장했어요. 브라우저에서 알림 권한을 확인해 주세요.'); return result === 'granted'; }
    catch { announce('알림을 켜지 못했어요. 기록은 저장할 수 있어요.'); return false; }
  }
  async function saveEntry(event) {
    event.preventDefault(); const button = $('saveEntry'); button.disabled = true;
    try {
      let next = structuredClone(state);
      if (kind === 'laundry') {
        const minutes = Number($('minutes').value);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { announce('1분부터 1440분 사이로 입력해 주세요.'); return; }
        const notify = await permission($('notifyTimer').checked); next = structuredClone(state);
        const now = Date.now(); next.timers.push({ id: uid(), minutes, startedAt: new Date(now).toISOString(), endsAt: now + minutes * 60000, hungAt: null, notify });
      }
      if (kind === 'expense') {
        const amount = C.parseAmount($('amount').value); if (!amount) { announce('1원 이상, 숫자로 입력해 주세요.'); $('amount').focus(); return; }
        const old = state.expenses.find(x => x.id === editingId);
        let at = old?.at || new Date().toISOString();
        if (old) { const input = $('expenseAt').value; const unchanged = input === (old.dateOnly ? C.day(old.at) : localInput(old.at)); if (!unchanged) { const d = new Date(input + (old.dateOnly ? 'T12:00:00' : '')); if (!Number.isFinite(d.getTime())) { announce('쓴 날짜를 확인해 주세요.'); return; } at = d.toISOString(); } }
        const item = { ...(old || {}), id: old?.id || uid(), amount, note: $('expenseNote').value.trim(), at, updatedAt: new Date().toISOString() };
        next.expenses = old ? next.expenses.map(x => x.id === old.id ? item : x) : [...next.expenses, item];
      }
      if (kind === 'medicine') {
        const name = $('medicineName').value.trim(), scheduled = $('dailyMedicine').checked;
        const times = scheduled ? [...new Set([...document.querySelectorAll('[name="medicineTime"]')].map(x => x.value).filter(Boolean))].sort() : [];
        if (!name || (scheduled && !times.length)) { announce('이름과 표시할 시간을 확인해 주세요.'); return; }
        const notify = await permission(scheduled && $('notifyMedicine').checked); next = structuredClone(state);
        const old = next.medicines.find(x => x.id === editingId);
        const med = { ...(old || { days: [0, 1, 2, 3, 4, 5, 6], startDate: '', endDate: '' }), id: old?.id || uid(), name, times,
          productId: $('medicineProduct').value, mealNote: $('mealNote').value.trim(), fastBeforeMinutes: optionalMinutes('fastBefore'), fastAfterMinutes: optionalMinutes('fastAfter') };
        next.medicines = old ? next.medicines.map(x => x.id === old.id ? med : x) : [...next.medicines, med]; next.notifyMeds[med.id] = notify;
      }
      if (kind === 'cosmetic') {
        const item = cosmeticFromForm(), old = (next.cosmetics || []).find(x => x.id === editingId);
        if (!item.name || (item.openedAt && !H.date(item.openedAt)) || (item.labelDate && !H.date(item.labelDate))) { announce('제품명과 날짜를 확인해 주세요.'); return; }
        if (item.openedAt && item.openedAt > C.day(new Date())) { announce('개봉일은 오늘까지 입력할 수 있어요.'); return; }
        const saved = { ...(old || {}), ...item, id: old?.id || uid() };
        next.cosmetics = old ? next.cosmetics.map(x => x.id === old.id ? saved : x) : [...(next.cosmetics || []), saved];
      }
      if (persist(next)) { go(kind === 'cosmetic' || (kind === 'expense' && editingId) ? 'history' : 'today'); if (kind === 'cosmetic') $('cosmeticSettings').open = true; announce('저장했어요.'); }
    } finally { button.disabled = false; }
  }
  function redraw() { if (screen === 'today') renderToday(); if (screen === 'history') renderHistory(); }
  function changeDose(key, undo = false) {
    const old = state.checks[key];
    const checks = undo ? C.undoDose(state.checks, key) : C.recordDose(state.checks, key, new Date());
    if (!persist({ ...state, checks })) return;
    redraw();
    announce(undo ? '복용 기록을 취소했어요.' : `${timeText(checks[key])}에 먹음으로 기록했어요.`, undo ? null : () => changeDose(key, true));
    const target = [...document.querySelectorAll('[data-check], [data-undo-dose]')].find(x => x.dataset.check === key || x.dataset.undoDose === key); target?.focus({ preventScroll: true });
    return old;
  }
  function changeTimer(id, field, value, message) {
    const old = state.timers.find(x => x.id === id); if (!old) return;
    if (persist({ ...state, timers: state.timers.map(x => x.id === id ? { ...x, [field]: value } : x) })) {
      redraw(); announce(message, value ? () => changeTimer(id, field, old[field] || null, '되돌렸어요.') : null);
    }
  }
  async function toggleMedNotification(id) {
    const enabled = !state.notifyMeds[id], result = enabled ? await permission(true) : false;
    if (persist({ ...state, notifyMeds: { ...state.notifyMeds, [id]: result } })) { renderHistory(); if (!enabled || result) announce(result ? '이 약의 알림을 켰어요. 약 이름은 숨겨요.' : '이 약의 알림을 껐어요.'); }
  }
  function notify(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try { const n = new Notification(title, { body, tag }); n.onclick = () => { window.focus(); go('today'); n.close(); }; return true; } catch { return false; }
  }
  function tick() {
    const now = new Date(), date = C.day(now); let changed = date !== shownDate;
    document.querySelectorAll('[data-timer-text]').forEach(el => {
      const timer = state.timers.find(x => x.id === el.dataset.timerText); if (!timer) return;
      const status = C.timerStatus(timer); const text = H.laundryTitle(timer, date);
      if (status.state === 'ready' && el.textContent !== text) changed = true;
      else el.textContent = text;
    });
    if (changed && screen === 'today') renderToday();
    const notices = [];
    for (const timer of state.timers) if (timer.notify && C.timerStatus(timer).state === 'ready' && !state.notified[`timer:${timer.id}`]) notices.push([`timer:${timer.id}`, '설정한 빨래 시간이 끝났어요. 세탁 상태를 확인해 주세요.']);
    const minutes = now.getHours() * 60 + now.getMinutes();
    for (const dose of C.doses(state.medicines, state.checks, now)) {
      const [h, m] = dose.time.split(':').map(Number), tag = `dose:${dose.key}`;
      if (state.notifyMeds[dose.med.id] && !dose.checkedAt && h * 60 + m <= minutes && !state.notified[tag]) notices.push([tag, '정해 둔 복용 기록을 확인해 주세요.']);
    }
    for (const [tag, body] of notices) if (notify('오늘 살림', body, tag)) persist({ ...state, notified: { ...state.notified, [tag]: new Date().toISOString() } });
  }
  document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => go(button.dataset.screen)));
  document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => chooseKind(button.dataset.kind)));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; renderHistory(); }));
  $('entryForm').addEventListener('submit', saveEntry);
  $('cancelEntry').addEventListener('click', () => go('today'));
  $('toastUndo').addEventListener('click', () => { const action = undoAction; undoAction = null; $('toast').hidden = true; action?.(); });
  $('newMedicine').addEventListener('click', () => { go('add', false); chooseKind('medicine'); });
  $('budgetForm').addEventListener('submit', event => {
    event.preventDefault(); const value = $('budgetAmount').value.trim(), budget = value ? C.parseAmount(value) : null;
    if (value && !budget) { announce('예산은 1원 이상 숫자로 입력해 주세요.'); $('budgetAmount').focus(); return; }
    if (persist({ ...state, budget })) { announce(budget ? '주간 예산을 저장했어요.' : '예산 표시를 껐어요.'); renderHistory(); }
  });
  $('main').addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-open-expenses')) { filter = 'expense'; go('history'); }
    if (b.dataset.quickLaundry) quickLaundry(Number(b.dataset.quickLaundry));
    if (b.dataset.quickDose) { if (b.dataset.quickDose.split('|')[1] !== C.day(new Date())) { renderQuickEntries(); announce('날짜가 바뀌어 오늘 항목으로 갱신했어요.'); return; } changeDose(b.dataset.quickDose); go('today'); }
    if (b.dataset.quickExpense) { const item = state.expenses.find(x => x.id === b.dataset.quickExpense); if (item) { chooseKind('expense'); $('amount').value = item.amount; $('expenseNote').value = item.note || ''; } }
    if (b.dataset.editCosmetic) { const id = b.dataset.editCosmetic; go('add', false); chooseKind('cosmetic', id); }
    if (b.dataset.finishCosmetic) { const id = b.dataset.finishCosmetic, old = state.cosmetics.find(x => x.id === id); if (old && persist({ ...state, cosmetics: state.cosmetics.map(x => x.id === id ? { ...x, finishedAt: old.finishedAt ? null : new Date().toISOString() } : x) })) { redraw(); announce(old.finishedAt ? '다시 사용 중으로 바꿨어요.' : '사용 완료로 기록했어요.'); } }
    if (b.dataset.editMedCare) { const id = b.dataset.editMedCare; go('add', false); chooseKind('medicine', id); }
    if (b.dataset.check) changeDose(b.dataset.check);
    if (b.dataset.undoDose) changeDose(b.dataset.undoDose, true);
    if (b.dataset.hang) changeTimer(b.dataset.hang, 'hungAt', new Date().toISOString(), '널었다고 기록했어요.');
    if (b.dataset.undoHang) changeTimer(b.dataset.undoHang, 'hungAt', null, '널기 기록을 취소했어요.');
    if (b.dataset.cancelTimer) changeTimer(b.dataset.cancelTimer, 'cancelledAt', new Date().toISOString(), '타이머를 취소했어요.');
    if (b.dataset.editExpense) { const id = b.dataset.editExpense; go('add', false); chooseKind('expense', id); }
    if (b.dataset.editMed) { const id = b.dataset.editMed; go('add', false); chooseKind('medicine', id); }
    if (b.dataset.notifyMed) toggleMedNotification(b.dataset.notifyMed);
    if (b.dataset.minutes) { $('minutes').value = b.dataset.minutes; $('minutes').focus(); }
    if (b.id === 'moreTime') { const count = document.querySelectorAll('[name="medicineTime"]').length; $('timeInputs').insertAdjacentHTML('beforeend', timeField('', count)); $('timeInputs').lastElementChild.querySelector('input').focus(); }
    if (b.hasAttribute('data-remove-time')) {
      const rows = [...document.querySelectorAll('.time-entry')]; if (rows.length === 1) { announce('복용 시간은 하나 이상 남겨 주세요.'); return; }
      const row = b.closest('.time-entry'), index = rows.indexOf(row); row.remove(); document.querySelectorAll('[name="medicineTime"]')[Math.min(index, rows.length - 2)]?.focus();
    }
  });
  $('backupButton').addEventListener('click', () => {
    try {
      const previousStorage = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith('salimnote-') || key === KEY) previousStorage[key] = localStorage.getItem(key); }
      const data = { app: '오늘 살림', version: 1, exportedAt: new Date().toISOString(), todayState: state, previousStorage };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `오늘살림-백업-${C.day(new Date())}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); announce('백업 파일을 만들었어요.');
    } catch { announce('백업하지 못했어요. 브라우저 다운로드 설정을 확인해 주세요.'); }
  });
  window.addEventListener('storage', event => { if (event.key === KEY) { state = loadState(); redraw(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { state = loadState(); redraw(); tick(); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && screen === 'add') go('today'); });
  setInterval(tick, 1000); go('today', false); tick();
})();
