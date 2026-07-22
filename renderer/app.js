/* ============================================================
   Memo 備忘錄 — 渲染程序邏輯
   資料模型 memo = {
     id, title, content, format: 'markdown'|'html',
     dateMode: 'single'|'range',
     date,            // 單日模式 YYYY-MM-DD
     startDate, endDate, // 區間模式 YYYY-MM-DD（區間 <= 3 個月）
     note,
     tags: [],        // 最多 2 個
     color,           // 顏色標籤
     pinned: bool,
     remind: bool,    // 是否需要提醒
     remindAt,        // 提醒時間 'YYYY-MM-DDTHH:mm'（datetime-local）
     notified: bool,  // 該提醒是否已觸發（避免重複跳出）
     createdAt, updatedAt
   }
   ============================================================ */

const COLORS = [
  { name: 'yellow', val: '#f4c430' },
  { name: 'green',  val: '#7bc86c' },
  { name: 'pink',   val: '#ef9bbd' },
  { name: 'purple', val: '#b39ddb' },
  { name: 'blue',   val: '#6fb3e0' },
  { name: 'gray',   val: '#9aa0a6' },
];
const MAX_TAGS = 3;

// 生命週期狀態（互斥單一值，與 tags/color 分開）
const STATUS = [
  { key: 'todo',       label: '待辦'   },
  { key: 'processing', label: '處理中' },
  { key: 'done',       label: '已完成' },
];
const STATUS_KEYS = STATUS.map(s => s.key);

const els = {
  app: document.querySelector('.app'),
  sidebar: document.querySelector('.sidebar'),
  list: document.getElementById('memoList'),
  newBtn: document.getElementById('newBtn'),
  modeBtn: document.getElementById('modeBtn'),
  // 設定面板
  settingsBtn: document.getElementById('settingsBtn'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsClose: document.getElementById('settingsClose'),
  themeSelect: document.getElementById('themeSelect'),
  fontSelect: document.getElementById('fontSelect'),
  // 自訂對話框
  dialogOverlay: document.getElementById('dialogOverlay'),
  dialogMsg: document.getElementById('dialogMsg'),
  dialogInput: document.getElementById('dialogInput'),
  dialogOk: document.getElementById('dialogOk'),
  dialogCancel: document.getElementById('dialogCancel'),
  // 檢視模式（浮動小視窗）
  miniPane: document.getElementById('miniPane'),
  miniBar: document.querySelector('.mini-bar'),
  miniList: document.getElementById('miniList'),
  miniBackBtn: document.getElementById('miniBackBtn'),
  miniDelBtn: document.getElementById('miniDelBtn'),
  miniExpandBtn: document.getElementById('miniExpandBtn'),
  miniDetail: document.getElementById('miniDetail'),
  miniDTitle: document.getElementById('miniDTitle'),
  miniDDate: document.getElementById('miniDDate'),
  miniDTags: document.getElementById('miniDTags'),
  miniTiptap: document.getElementById('miniTiptap'),
  miniMdToolbar: document.getElementById('miniMdToolbar'),
  search: document.getElementById('search'),
  statusTabs: document.getElementById('statusTabs'),
  statusSeg: document.getElementById('statusSeg'),
  resizer: document.getElementById('resizer'),
  sortSelect: document.getElementById('sortSelect'),
  countLabel: document.getElementById('countLabel'),
  emptyState: document.getElementById('emptyState'),
  editorPane: document.getElementById('editorPane'),
  title: document.getElementById('title'),
  // 日期
  dmodeBtns: Array.from(document.querySelectorAll('.dmode-btn')),
  singleDateWrap: document.getElementById('singleDateWrap'),
  startDateWrap: document.getElementById('startDateWrap'),
  endDateWrap: document.getElementById('endDateWrap'),
  date: document.getElementById('date'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  dateError: document.getElementById('dateError'),
  // 提醒
  remindToggle: document.getElementById('remindToggle'),
  remindAtWrap: document.getElementById('remindAtWrap'),
  remindAt: document.getElementById('remindAt'),
  remindHint: document.getElementById('remindHint'),
  // 其他欄位
  tagChips: document.getElementById('tagChips'),
  tagInput: document.getElementById('tagInput'),
  colorBar: document.getElementById('colorBar'),
  pinBtn: document.getElementById('pinBtn'),
  // 內容
  tiptap: document.getElementById('tiptap'),       // Markdown 即時編輯器容器
  mdToolbar: document.getElementById('mdToolbar'),
  deleteBtn: document.getElementById('deleteBtn'),
  saveStatus: document.getElementById('saveStatus'),
};

let memos = [];
let activeId = null;
let saveTimer = null;
let statusFilter = 'todo';   // 目前分頁：todo | processing | done
let viewMode = false;     // 檢視模式（浮動小視窗）
let tiptap = null;        // 主編輯器 TipTap 實例
let miniTiptap = null;    // 檢視模式 TipTap 實例

/* ---------- 工具 ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function plainSnippet(memo) {
  const text = memo.format === 'markdown'
    ? (memo.content || '')
    : (memo.content || '').replace(/<[^>]*>/g, ' ');
  return text.replace(/[#*`>_~\-]/g, '').replace(/\s+/g, ' ').trim();
}

function dateLabel(m) {
  if (m.dateMode === 'range') {
    if (m.startDate || m.endDate) return `${m.startDate || '?'} ~ ${m.endDate || '?'}`;
    return '';
  }
  return m.date || '';
}

/* ---------- 自訂對話框（取代原生 confirm / prompt） ---------- */
function showDialog({ message, input = false, defaultValue = '', okText = '確定', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    els.dialogMsg.textContent = message;
    els.dialogInput.classList.toggle('hidden', !input);
    els.dialogInput.value = input ? defaultValue : '';
    els.dialogOk.textContent = okText;
    els.dialogCancel.textContent = cancelText;
    els.dialogOk.classList.toggle('danger', danger);
    els.dialogOverlay.classList.remove('hidden');
    if (input) setTimeout(() => { els.dialogInput.focus(); els.dialogInput.select(); }, 0);
    else setTimeout(() => els.dialogOk.focus(), 0);

    const done = (result) => {
      els.dialogOverlay.classList.add('hidden');
      els.dialogOk.onclick = els.dialogCancel.onclick = els.dialogOverlay.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const cancelVal = input ? null : false;
    const okVal = () => (input ? els.dialogInput.value : true);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); done(cancelVal); }
      else if (e.key === 'Enter') { e.preventDefault(); done(okVal()); }
    }
    els.dialogOk.onclick = () => done(okVal());
    els.dialogCancel.onclick = () => done(cancelVal);
    els.dialogOverlay.onclick = (e) => { if (e.target === els.dialogOverlay) done(cancelVal); };
    document.addEventListener('keydown', onKey, true);
  });
}
const uiPrompt = (message, defaultValue = '') =>
  showDialog({ message, input: true, defaultValue, okText: '確定' });

// 是否為「當日」：單日=日期為今天；區間=結束日為今天
function isToday(m) {
  const t = todayStr();
  if (m.dateMode === 'range') return m.endDate === t;
  return m.date === t;
}

// 是否「已過期」：相關日期早於今天（區間=結束日；單日=日期）
function isExpired(m) {
  const d = m.dateMode === 'range' ? m.endDate : m.date;
  return !!d && d < todayStr();
}

// 日期徽章（無日期則不顯示）；已過期加紅色 highlight，當日加強調樣式
function dateBadge(m, cls = 'mi-date') {
  const d = dateLabel(m);
  if (!d) return '';
  const state = isExpired(m) ? ' expired' : (isToday(m) ? ' today' : '');
  return `<span class="${cls}${state}">📅 ${escapeHtml(d)}</span>`;
}

// 提醒是否已排定（有開啟且有時間）
function hasRemind(m) {
  return !!(m.remind && m.remindAt);
}

// 提醒徽章：待觸發顯示 ⏰，已觸發顯示 🔔（淡化）
function remindBadge(m) {
  if (!hasRemind(m)) return '';
  const fired = m.notified;
  const t = m.remindAt.replace('T', ' ');
  return `<span class="mi-remind${fired ? ' fired' : ''}" title="提醒時間：${escapeHtml(t)}">${fired ? '🔔' : '⏰'} ${escapeHtml(t.slice(5))}</span>`;
}

// 將 datetime-local 字串轉為時間戳（本地時區）
function remindTs(m) {
  if (!hasRemind(m)) return NaN;
  const d = new Date(m.remindAt);
  return d.getTime();
}

// 將 Date 轉為 datetime-local 需要的本地字串 'YYYY-MM-DDTHH:mm'
function toLocalDatetimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// 區間是否超過 3 個月，或結束早於開始
function rangeInvalid(start, end) {
  if (!start || !end) return false;
  const s = new Date(start), e = new Date(end);
  if (e < s) return 'end-before-start';
  const limit = new Date(s); limit.setMonth(limit.getMonth() + 3);
  if (e > limit) return 'too-long';
  return false;
}

/* ---------- 持久化 ---------- */
async function loadAll() {
  memos = await window.memoAPI.load();
  if (!Array.isArray(memos)) memos = [];
  // 舊資料相容
  memos.forEach(m => {
    if (!m.dateMode) m.dateMode = 'single';
    if (!Array.isArray(m.tags)) m.tags = [];
    if (!m.color) m.color = COLORS[0].val;
    if (typeof m.pinned !== 'boolean') m.pinned = false;
    if (typeof m.remind !== 'boolean') m.remind = false;
    if (typeof m.remindAt !== 'string') m.remindAt = '';
    if (typeof m.notified !== 'boolean') m.notified = false;
    if (!STATUS_KEYS.includes(m.status)) m.status = 'todo'; // 舊資料預設為待辦
    if (m.format !== 'markdown') m.format = 'markdown'; // 已移除 HTML 格式，全部統一為 markdown
  });
  renderList();
}

function persist() {
  clearTimeout(saveTimer);
  els.saveStatus.textContent = '儲存中…';
  saveTimer = setTimeout(async () => {
    await window.memoAPI.save(memos);
    els.saveStatus.textContent = '已儲存 ✓';
    setTimeout(() => { els.saveStatus.textContent = ''; }, 1200);
  }, 350);
}

function currentMemo() { return memos.find(x => x.id === activeId); }

function touch(m) {
  persist();
  renderList();
}

// 離開某則時：單日模式若未設定日期，預設為今天
function finalizeActive() {
  const m = currentMemo(); if (!m) return;
  if (m.dateMode === 'single' && !m.date) {
    m.date = todayStr();
    persist();
  }
}

/* ---------- 清單 ---------- */
function getVisibleMemos() {
  const q = els.search.value.trim().toLowerCase();
  let arr = memos.filter(m => m.status === statusFilter);
  arr = arr.filter(m => {
    if (!q) return true;
    return (m.title || '').toLowerCase().includes(q) ||
           (m.content || '').toLowerCase().includes(q) ||
           (m.note || '').toLowerCase().includes(q) ||
           (m.tags || []).some(t => t.toLowerCase().includes(q));
  });
  const sort = els.sortSelect.value;
  arr.sort((a, b) => {
    // 釘選永遠在最上面
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'zh-Hant');
    if (sort === 'date') return (dateLabel(b)).localeCompare(dateLabel(a));
    return 0; // 手動排序：維持陣列順序（穩定排序）
  });
  return arr;
}

// 拖曳排序是否可用（僅手動排序、且未篩選時）
function canDrag() {
  return els.sortSelect.value === 'manual' && els.search.value.trim() === '';
}

function renderList() {
  const visible = getVisibleMemos();
  const draggable = canDrag();
  els.list.innerHTML = '';
  let idx = 0;
  for (const m of visible) {
    const li = document.createElement('li');
    li.className = 'memo-item' + (m.id === activeId ? ' active' : '');
    li.style.setProperty('--mi-color', m.color || COLORS[0].val);
    li.style.setProperty('--i', idx++);
    li.dataset.id = m.id;
    li.draggable = draggable;
    const tagsHtml = (m.tags || [])
      .map(t => `<span class="mi-tag" title="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('');
    li.innerHTML = `
      <div class="mi-title-row">
        ${draggable ? '<span class="mi-handle" title="拖曳排序">⠿</span>' : ''}
        ${m.pinned ? '<span class="mi-pin">📌</span>' : ''}
        <span class="mi-title">${escapeHtml(m.title) || '（未命名）'}</span>
        <span class="mi-actions">
          <button class="mi-icon mi-del" title="刪除">🗑</button>
        </span>
      </div>
      <div class="mi-snippet">${escapeHtml(plainSnippet(m).slice(0, 60)) || '（無內容）'}</div>
      <div class="mi-meta">
        ${dateBadge(m)}
        ${remindBadge(m)}
        <div class="mi-tags">${tagsHtml}</div>
      </div>`;
    li.addEventListener('click', () => selectMemo(m.id));
    li.querySelector('.mi-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMemo(m.id);
    });
    if (draggable) attachDragHandlers(li);
    els.list.appendChild(li);
  }
  els.countLabel.textContent = `${visible.length} 則備忘錄`;
  updateStatusCounts();
}

// 更新分頁上的各狀態數量（全量計數，不受搜尋影響）
function updateStatusCounts() {
  if (!els.statusTabs) return;
  const counts = { todo: 0, processing: 0, done: 0 };
  memos.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });
  els.statusTabs.querySelectorAll('.status-tab').forEach(tab => {
    const key = tab.dataset.status;
    tab.classList.toggle('active', key === statusFilter);
    const c = tab.querySelector('.st-count');
    if (c) c.textContent = counts[key] || 0;
  });
}

/* ---------- 拖曳排序 ---------- */
let dragId = null;

function attachDragHandlers(li) {
  li.addEventListener('dragstart', (e) => {
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    dragId = null;
    Array.from(els.list.children).forEach(c =>
      c.classList.remove('dragging', 'drop-before', 'drop-after'));
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (li.dataset.id === dragId) return;
    const rect = li.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    li.classList.toggle('drop-before', before);
    li.classList.toggle('drop-after', !before);
  });
  li.addEventListener('dragleave', () => {
    li.classList.remove('drop-before', 'drop-after');
  });
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetId = li.dataset.id;
    const before = li.classList.contains('drop-before');
    li.classList.remove('drop-before', 'drop-after');
    reorderMemos(dragId, targetId, before);
  });
}

function reorderMemos(fromId, targetId, placeBefore) {
  if (!fromId || fromId === targetId) return;
  const from = memos.findIndex(m => m.id === fromId);
  if (from < 0) return;
  const [item] = memos.splice(from, 1);
  let to = memos.findIndex(m => m.id === targetId);
  if (to < 0) { memos.push(item); }
  else { if (!placeBefore) to += 1; memos.splice(to, 0, item); }
  persist();
  renderList();
}

/* ---------- 刪除（清單 icon 與編輯區共用） ---------- */
async function deleteMemo(id) {
  const m = memos.find(x => x.id === id); if (!m) return false;
  const ok = await showDialog({
    message: `確定刪除「${m.title || '未命名'}」？\n此動作無法復原。`,
    okText: '刪除', cancelText: '取消', danger: true,
  });
  if (!ok) return false;
  memos = memos.filter(x => x.id !== id);
  if (activeId === id) {
    activeId = null;
    els.editorPane.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
  }
  persist();
  renderList();
  return true;
}

/* ---------- 顏色標籤 ---------- */
function buildColorBar() {
  els.colorBar.innerHTML = '';
  COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = c.val;
    sw.dataset.color = c.val;
    sw.title = c.name;
    sw.addEventListener('click', () => {
      const m = currentMemo(); if (!m) return;
      m.color = c.val;
      updateColorBar(m.color);
      touch(m);
    });
    els.colorBar.appendChild(sw);
  });
}
function updateColorBar(color) {
  Array.from(els.colorBar.children).forEach(sw =>
    sw.classList.toggle('active', sw.dataset.color === color));
}

/* ---------- 標籤 ---------- */
function renderTags(m) {
  els.tagChips.innerHTML = '';
  (m.tags || []).forEach((t, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.title = t;
    chip.innerHTML = `<span class="chip-text">${escapeHtml(t)}</span> <span class="chip-x">✕</span>`;
    chip.querySelector('.chip-x').addEventListener('click', () => {
      m.tags.splice(i, 1);
      renderTags(m);
      touch(m);
    });
    els.tagChips.appendChild(chip);
  });
  const full = (m.tags || []).length >= MAX_TAGS;
  els.tagInput.disabled = full;
  els.tagInput.placeholder = full ? '已達 3 個上限' : '輸入後按 Enter（最多 3 個）';
}

/* ---------- 日期模式 ---------- */
function applyDateMode(m) {
  const single = m.dateMode !== 'range';
  els.dmodeBtns.forEach(b => b.classList.toggle('active', b.dataset.dmode === m.dateMode));
  els.singleDateWrap.classList.toggle('hidden', !single);
  els.startDateWrap.classList.toggle('hidden', single);
  els.endDateWrap.classList.toggle('hidden', single);
  els.dateError.classList.add('hidden');
}

/* ---------- 提醒 ---------- */
// 依 memo 狀態更新提醒欄位的顯示與提示文字
function applyRemindUI(m) {
  els.remindToggle.checked = !!m.remind;
  els.remindAtWrap.classList.toggle('hidden', !m.remind);
  els.remindAt.value = m.remindAt || '';
  updateRemindHint(m);
}

function updateRemindHint(m) {
  const hint = els.remindHint;
  if (!m.remind || !m.remindAt) {
    hint.classList.add('hidden');
    hint.textContent = '';
    return;
  }
  const ts = remindTs(m);
  let text, cls = 'remind-hint';
  if (isNaN(ts)) { text = ''; }
  else if (m.notified) { text = '🔔 已提醒'; cls += ' fired'; }
  else if (ts <= Date.now()) { text = '⏰ 即將提醒'; cls += ' due'; }
  else {
    const mins = Math.round((ts - Date.now()) / 60000);
    text = mins < 60 ? `⏰ ${mins} 分鐘後提醒`
      : mins < 1440 ? `⏰ ${Math.round(mins / 60)} 小時後提醒`
      : `⏰ ${Math.round(mins / 1440)} 天後提醒`;
  }
  hint.className = cls;
  hint.textContent = text;
  hint.classList.toggle('hidden', !text);
}

function showDateError(kind) {
  els.dateError.textContent = kind === 'too-long'
    ? '⚠ 區間不可大於 3 個月，已還原。'
    : '⚠ 結束日期不可早於開始日期，已還原。';
  els.dateError.classList.remove('hidden');
}

/* ---------- 內容視圖 ---------- */
let suppressTiptapUpdate = false; // 程式化 setContent 時避免觸發 onUpdate 存檔

function refreshContentView() {
  const m = currentMemo(); if (!m || !tiptap) return;
  suppressTiptapUpdate = true;
  tiptap.commands.setContent(m.content || '', false);
  suppressTiptapUpdate = false;
  syncToolbar(tiptap, els.mdToolbar);
}

/* ---------- 選取 ---------- */
function selectMemo(id) {
  const m = memos.find(x => x.id === id);
  if (!m) return;
  if (activeId && activeId !== id) finalizeActive();
  activeId = id;

  els.emptyState.classList.add('hidden');
  els.editorPane.classList.remove('hidden');

  els.title.value = m.title || '';
  els.date.value = m.date || '';
  els.startDate.value = m.startDate || '';
  els.endDate.value = m.endDate || '';
  applyDateMode(m);
  applyRemindUI(m);
  renderTags(m);
  els.tagInput.value = '';
  updateColorBar(m.color || COLORS[0].val);
  els.pinBtn.classList.toggle('active', !!m.pinned);
  els.pinBtn.textContent = m.pinned ? '📌 已釘選' : '📌 釘選';
  updateStatusSeg(m.status);
  refreshContentView();
  renderList();
}

/* ---------- 事件：基本欄位 ---------- */
els.newBtn.addEventListener('click', () => {
  finalizeActive();
  const m = {
    id: uid(), title: '', content: '', format: 'markdown',
    dateMode: 'single', date: '', startDate: '', endDate: '', // 不給預設日期
    note: '', tags: [], color: COLORS[0].val, pinned: false,
    remind: false, remindAt: '', notified: false,
    status: statusFilter, // 繼承目前分頁，新項目留在當前視圖
    createdAt: Date.now(),
  };
  memos.push(m); // 新便條從最下方往下長
  persist();
  selectMemo(m.id);
  els.title.focus();
});

els.title.addEventListener('input', () => {
  const m = currentMemo(); if (!m) return;
  m.title = els.title.value; touch(m);
});

/* 點整個日期框就開日曆（不必只點 icon） */
[els.date, els.startDate, els.endDate, els.remindAt].forEach(inp => {
  inp.addEventListener('click', () => {
    if (typeof inp.showPicker === 'function') {
      try { inp.showPicker(); } catch (e) {}
    }
  });
});

/* 日期模式切換 */
els.dmodeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const m = currentMemo(); if (!m) return;
    m.dateMode = btn.dataset.dmode;
    applyDateMode(m);
    touch(m);
  });
});
els.date.addEventListener('input', () => {
  const m = currentMemo(); if (!m) return;
  m.date = els.date.value; touch(m);
});
els.startDate.addEventListener('input', () => {
  const m = currentMemo(); if (!m) return;
  const bad = rangeInvalid(els.startDate.value, m.endDate);
  if (bad) { showDateError(bad); els.startDate.value = m.startDate || ''; return; }
  els.dateError.classList.add('hidden');
  m.startDate = els.startDate.value; touch(m);
});
els.endDate.addEventListener('input', () => {
  const m = currentMemo(); if (!m) return;
  const bad = rangeInvalid(m.startDate, els.endDate.value);
  if (bad) { showDateError(bad); els.endDate.value = m.endDate || ''; return; }
  els.dateError.classList.add('hidden');
  m.endDate = els.endDate.value; touch(m);
});

/* 標籤輸入 */
els.tagInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const m = currentMemo(); if (!m) return;
  const val = els.tagInput.value.trim();
  if (!val) return;
  if (m.tags.length >= MAX_TAGS) return;
  if (m.tags.some(t => t.toLowerCase() === val.toLowerCase())) { els.tagInput.value = ''; return; }
  m.tags.push(val);
  els.tagInput.value = '';
  renderTags(m);
  touch(m);
});

/* 釘選 */
els.pinBtn.addEventListener('click', () => {
  const m = currentMemo(); if (!m) return;
  m.pinned = !m.pinned;
  els.pinBtn.classList.toggle('active', m.pinned);
  els.pinBtn.textContent = m.pinned ? '📌 已釘選' : '📌 釘選';
  touch(m);
});

/* 提醒開關 */
els.remindToggle.addEventListener('change', () => {
  const m = currentMemo(); if (!m) return;
  m.remind = els.remindToggle.checked;
  if (m.remind && !m.remindAt) {
    // 預設提醒時間：一小時後
    m.remindAt = toLocalDatetimeValue(new Date(Date.now() + 60 * 60 * 1000));
  }
  m.notified = false; // 重新啟用提醒
  applyRemindUI(m);
  touch(m);
});

/* 提醒時間 */
els.remindAt.addEventListener('input', () => {
  const m = currentMemo(); if (!m) return;
  m.remindAt = els.remindAt.value;
  m.notified = false; // 改了時間 → 重新等待觸發
  updateRemindHint(m);
  touch(m);
});

/* 刪除 */
els.deleteBtn.addEventListener('click', () => {
  if (activeId) deleteMemo(activeId);
});

els.search.addEventListener('input', renderList);
els.sortSelect.addEventListener('change', renderList);

/* ---------- 狀態切換動效 ---------- */
// 清單依序淡入（僅在切換分頁時播放一次，避免每次 renderList 都動）
function playListSwitch() {
  const list = els.list;
  list.classList.remove('switch-in');
  void list.offsetWidth;        // 強制 reflow 重啟動畫
  list.classList.add('switch-in');
  clearTimeout(playListSwitch._t);
  // 動畫（含 stagger）結束後移除 class，讓之後的 render 不再動
  playListSwitch._t = setTimeout(() => list.classList.remove('switch-in'), 900);
}

// 短暫加上 class 播放一次性動畫，結束後自動移除
function pulseClass(el, cls, ms = 600) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

// 標記「已完成」時，在按鈕上飛出一個 ✓
function cheerDone(btn) {
  if (!btn) return;
  const cheer = document.createElement('span');
  cheer.className = 'status-cheer';
  cheer.textContent = '✓';
  cheer.style.left = '50%';
  cheer.style.top = '0';
  cheer.style.transform = 'translateX(-50%)';
  btn.appendChild(cheer);
  setTimeout(() => cheer.remove(), 750);
}

/* ---------- 狀態分頁 / 編輯區狀態切換 ---------- */
// 更新編輯區狀態分段的 active
function updateStatusSeg(status) {
  if (!els.statusSeg) return;
  els.statusSeg.querySelectorAll('.seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.status === status));
}

// 分頁：切換目前檢視的狀態
els.statusTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.status-tab'); if (!tab) return;
  const next = tab.dataset.status;
  if (next === statusFilter) return;
  statusFilter = next;
  pulseClass(tab, 'tab-pop', 320);
  renderList();
  playListSwitch();
});

// 編輯區：改變這則的狀態（分頁跟著走，保持選中項可見）
els.statusSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  const m = currentMemo(); if (!m) return;
  const next = btn.dataset.status;
  const changed = next !== m.status;
  m.status = next;
  updateStatusSeg(m.status);
  if (changed) {
    pulseClass(btn, 'pop', 340);
    if (next === 'done') { pulseClass(btn, 'done-burst', 620); cheerDone(btn); }
  }
  statusFilter = m.status;
  touch(m); // persist + renderList（更新分頁 active 與計數）
  if (changed) playListSwitch();
});

/* ---------- 檢視模式：浮動小視窗 ---------- */
// 小視窗的清單
function renderMiniList() {
  const visible = getVisibleMemos();
  els.miniList.innerHTML = '';
  for (const m of visible) {
    const li = document.createElement('li');
    li.className = 'mini-item';
    li.style.setProperty('--mi-color', m.color || COLORS[0].val);
    const tagsHtml = (m.tags || [])
      .map(t => `<span class="mi-tag" title="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('');
    li.innerHTML = `
      <div class="mi-title-row">
        ${m.pinned ? '<span class="mi-pin">📌</span>' : ''}
        <span class="mi-title">${escapeHtml(m.title) || '（未命名）'}</span>
        <span class="mi-actions">
          <button class="mi-icon mi-del" title="刪除">🗑</button>
        </span>
      </div>
      <div class="mi-meta">
        ${dateBadge(m)}
        ${remindBadge(m)}
        <div class="mi-tags">${tagsHtml}</div>
      </div>`;
    li.addEventListener('click', () => showMiniDetail(m.id));
    li.querySelector('.mi-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await deleteMemo(m.id)) renderMiniList(); // 含確認防呆，刪後刷新小清單
    });
    els.miniList.appendChild(li);
  }
}

// 在小視窗內展開某則的唯讀內容
function showMiniDetail(id) {
  const m = memos.find(x => x.id === id);
  if (!m) return;
  activeId = id;
  const color = m.color || COLORS[0].val;
  els.miniDetail.style.setProperty('--vc-color', color);
  els.miniDetail.style.setProperty('--vc-bg', color + '14');
  els.miniDTitle.textContent = m.title || '（未命名）';
  els.miniDDate.textContent = dateLabel(m) ? '📅 ' + dateLabel(m) : '';
  els.miniDDate.classList.toggle('hidden', !dateLabel(m));
  els.miniDDate.classList.toggle('today', isToday(m) && !isExpired(m));
  els.miniDDate.classList.toggle('expired', isExpired(m));
  els.miniDTags.innerHTML = (m.tags || [])
    .map(t => `<span class="chip" title="${escapeHtml(t)}"><span class="chip-text">${escapeHtml(t)}</span></span>`).join('');

  // TipTap WYSIWYG：渲染呈現且可直接編輯
  if (miniTiptap) {
    suppressTiptapUpdate = true;
    miniTiptap.commands.setContent(m.content || '', false);
    suppressTiptapUpdate = false;
    syncToolbar(miniTiptap, els.miniMdToolbar);
  }

  els.miniList.classList.add('hidden');
  els.miniDetail.classList.remove('hidden');
  els.miniBackBtn.classList.remove('hidden');
  els.miniDelBtn.classList.remove('hidden');
}

function showMiniList() {
  els.miniDetail.classList.add('hidden');
  els.miniList.classList.remove('hidden');
  els.miniBackBtn.classList.add('hidden');
  els.miniDelBtn.classList.add('hidden');
  renderMiniList();
}

async function setMode(view) {
  if (view) finalizeActive(); // 進入檢視模式前，視為編輯完成
  viewMode = view;
  els.app.classList.toggle('mini-mode', view);
  els.modeBtn.classList.toggle('active', view);
  els.modeBtn.title = view ? '回到編輯模式' : '檢視模式（浮動小視窗）';
  els.miniPane.classList.toggle('hidden', !view);

  if (view) {
    await window.memoAPI.enterMini();   // 縮小視窗 + 自動置頂
    showMiniList();
  } else {
    await window.memoAPI.exitMini();    // 還原視窗 + 取消置頂
    if (activeId && currentMemo()) selectMemo(activeId);
    else { els.editorPane.classList.add('hidden'); els.emptyState.classList.remove('hidden'); }
    renderList();
  }
}

els.modeBtn.addEventListener('click', () => setMode(!viewMode));
els.miniExpandBtn.addEventListener('click', () => setMode(false));
els.miniBackBtn.addEventListener('click', showMiniList);
els.miniDelBtn.addEventListener('click', async () => {
  if (activeId && await deleteMemo(activeId)) showMiniList(); // 含確認防呆
});

// 檢視模式工具列
els.miniMdToolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn || !miniTiptap) return;
  const fn = MD_ACTIONS[btn.dataset.md];
  if (fn) fn(miniTiptap);
});

/* ---------- 設定 / 個性化 ---------- */
const FONT_PX = { small: '13px', medium: '15px', large: '18px' };
const settings = { theme: 'default', fontSize: 'medium' };

function loadSettings() {
  try {
    const raw = localStorage.getItem('memo-settings');
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) {}
}
function saveSettings() {
  try { localStorage.setItem('memo-settings', JSON.stringify(settings)); } catch (e) {}
}

const OVERLAY_COLORS = {
  default: { color: '#26262d', symbolColor: '#e8e8ec' },
  paper:   { color: '#ece6da', symbolColor: '#2c2a25' },
};
function applyTheme(name) {
  settings.theme = name || 'default';
  if (settings.theme !== 'default') document.documentElement.setAttribute('data-theme', settings.theme);
  else document.documentElement.removeAttribute('data-theme');
  els.themeSelect.value = settings.theme;
  // 同步標題列控制鈕的配色（僅 Windows/Linux 的 titleBarOverlay）
  const ov = OVERLAY_COLORS[settings.theme] || OVERLAY_COLORS.default;
  if (window.memoAPI.platform !== 'darwin' && window.memoAPI.setOverlay) {
    window.memoAPI.setOverlay(ov);
  }
}
function applyFontSize(size) {
  settings.fontSize = FONT_PX[size] ? size : 'medium';
  document.documentElement.style.setProperty('--content-fs', FONT_PX[settings.fontSize]);
  els.fontSelect.value = settings.fontSize;
}

function applyAllSettings() {
  applyTheme(settings.theme);
  applyFontSize(settings.fontSize);
}

// 開關設定面板
function openSettings() { els.settingsOverlay.classList.remove('hidden'); }
function closeSettings() { els.settingsOverlay.classList.add('hidden'); }

els.settingsBtn.addEventListener('click', openSettings);
els.settingsClose.addEventListener('click', closeSettings);
els.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === els.settingsOverlay) closeSettings(); // 點背景關閉
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.settingsOverlay.classList.contains('hidden')) closeSettings();
});

els.themeSelect.addEventListener('change', () => { applyTheme(els.themeSelect.value); saveSettings(); });
els.fontSelect.addEventListener('change', () => { applyFontSize(els.fontSelect.value); saveSettings(); });

/* ---------- TipTap Markdown 編輯器 ---------- */
// 工具列按鈕 → TipTap 指令
const MD_ACTIONS = {
  bold: e => e.chain().focus().toggleBold().run(),
  italic: e => e.chain().focus().toggleItalic().run(),
  strike: e => e.chain().focus().toggleStrike().run(),
  code: e => e.chain().focus().toggleCode().run(),
  h1: e => e.chain().focus().toggleHeading({ level: 1 }).run(),
  h2: e => e.chain().focus().toggleHeading({ level: 2 }).run(),
  h3: e => e.chain().focus().toggleHeading({ level: 3 }).run(),
  bulletList: e => e.chain().focus().toggleBulletList().run(),
  orderedList: e => e.chain().focus().toggleOrderedList().run(),
  blockquote: e => e.chain().focus().toggleBlockquote().run(),
  codeBlock: e => e.chain().focus().toggleCodeBlock().run(),
  undo: e => e.chain().focus().undo().run(),
  redo: e => e.chain().focus().redo().run(),
};
// 依游標所在位置更新指定工具列的 active 狀態
function syncToolbar(editor, toolbarEl) {
  if (!editor || !toolbarEl) return;
  const state = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    h1: editor.isActive('heading', { level: 1 }),
    h2: editor.isActive('heading', { level: 2 }),
    h3: editor.isActive('heading', { level: 3 }),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    codeBlock: editor.isActive('codeBlock'),
  };
  toolbarEl.querySelectorAll('.md-btn').forEach(b => {
    const k = b.dataset.md;
    if (k in state) b.classList.toggle('active', state[k]);
  });
}

// 建立一個 TipTap 編輯器（主編輯器 / 檢視模式共用）
function makeEditor(element, toolbarEl) {
  return new window.TipTap.Editor({
    element,
    extensions: [
      window.TipTap.StarterKit,
      window.TipTap.Markdown.configure({ html: true, linkify: true, breaks: true }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      syncToolbar(editor, toolbarEl);
      if (suppressTiptapUpdate) return;
      const m = currentMemo();
      if (!m) return;
      m.content = editor.storage.markdown.getMarkdown();
      touch(m);
    },
    onSelectionUpdate: ({ editor }) => syncToolbar(editor, toolbarEl),
  });
}

function initTipTap() {
  if (!window.TipTap) { console.error('TipTap bundle 未載入'); return; }
  tiptap = makeEditor(els.tiptap, els.mdToolbar);
  miniTiptap = makeEditor(els.miniTiptap, els.miniMdToolbar);
}

els.mdToolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn || !tiptap) return;
  const fn = MD_ACTIONS[btn.dataset.md];
  if (fn) fn(tiptap);
});

/* ---------- 欄寬拖曳 ---------- */
const SIDEBAR_MIN = 220, SIDEBAR_MAX = 560;

function applySidebarWidth(px) {
  const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, px));
  els.app.style.setProperty('--sidebar-w', w + 'px');
  return w;
}

function loadSidebarWidth() {
  const raw = parseInt(localStorage.getItem('memo-sidebar-w'), 10);
  if (!isNaN(raw)) applySidebarWidth(raw);
}

(function initResizer() {
  if (!els.resizer) return;
  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const left = els.app.getBoundingClientRect().left;
    applySidebarWidth(e.clientX - left);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    els.resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const w = parseInt(getComputedStyle(els.sidebar).width, 10);
    if (!isNaN(w)) localStorage.setItem('memo-sidebar-w', w);
  };
  els.resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    els.resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();

/* ---------- 待辦提醒排程 ---------- */
// 掃描所有 memo，觸發到期且尚未提醒的項目
function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const m of memos) {
    if (!hasRemind(m) || m.notified) continue;
    if (m.status === 'done') continue; // 已完成不再提醒
    const ts = remindTs(m);
    if (isNaN(ts) || ts > now) continue;
    fireReminder(m);
    m.notified = true;
    changed = true;
  }
  if (changed) {
    persist();
    renderList();
    if (viewMode) renderMiniList();
    const active = currentMemo();
    if (active) updateRemindHint(active);
  }
}

// 發出系統通知（Windows 11 原生 Toast）
function fireReminder(m) {
  const title = m.title ? `⏰ ${m.title}` : '⏰ 待辦提醒';
  let body = plainSnippet(m).slice(0, 120);
  if (!body) body = dateLabel(m) ? `日期：${dateLabel(m)}` : '你有一則待辦事項需要處理。';
  try {
    window.memoAPI.notify({ id: m.id, title, body });
  } catch (e) {
    console.error('提醒通知失敗：', e);
  }
}

// 點擊通知：切到該則所在分頁並選取、開啟
function openMemoFromNotification(id) {
  const m = memos.find(x => x.id === id);
  if (!m) return;
  if (viewMode) { setMode(false); }
  if (m.status !== statusFilter) { statusFilter = m.status; }
  renderList();
  selectMemo(id);
}

if (window.memoAPI.onNotificationClick) {
  window.memoAPI.onNotificationClick(openMemoFromNotification);
}

// 每 30 秒掃描一次；啟動後短暫延遲先掃一次（補觸發已過期的提醒）
setInterval(checkReminders, 30 * 1000);

/* ---------- 啟動 ---------- */
function hideLoading() {
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.add('fade');
  setTimeout(() => el.classList.add('hidden'), 280); // 等淡出動畫結束
}

document.documentElement.classList.add('platform-' + (window.memoAPI.platform || 'unknown'));
buildColorBar();
loadSettings();
applyAllSettings();
loadSidebarWidth();
initTipTap();
loadAll().finally(() => {
  hideLoading();
  // 啟動後補掃一次：觸發程式未開啟期間已到期的提醒
  setTimeout(checkReminders, 1500);
});
