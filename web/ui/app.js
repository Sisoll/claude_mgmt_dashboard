(function () {
  // ============== Shared helpers ==============
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => (root || document).querySelectorAll(sel);

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function formatHHMM(ms) {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  function formatRuntime(ms) {
    if (!ms || ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
    if (m > 0) return `${m}m ${String(sec).padStart(2,'0')}s`;
    return `${sec}s`;
  }
  function formatRelative(ms) {
    if (!ms) return 'just now';
    const diff = Date.now() - ms;
    if (diff < 5000) return 'just now';
    if (diff < 60000) return Math.floor(diff/1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
    return Math.floor(diff/3600000) + 'h ago';
  }

  const STATUS_LABEL = {
    running: 'Running',
    waiting: 'Waiting for input',
    completed: 'Completed',
    failed: 'Error',
    pending: 'Pending',
  };
  const SUBAGENT_LABEL = {
    running: 'running',
    waiting: 'waiting',
    completed: 'done',
    failed: 'failed',
  };
  const PERM_LABEL = {
    default: 'ask',
    acceptEdits: 'auto-edit',
    bypassPermissions: 'YOLO',
    plan: 'plan-only',
  };
  function hostKindFromName(n) {
    if (!n) return '';
    const low = n.toLowerCase();
    if (low.includes('code') || low.includes('cursor')) return 'ide';
    if (low.includes('idea') || low.includes('pycharm') || low.includes('webstorm') || low.includes('phpstorm') || low.includes('goland') || low.includes('rider')) return 'jetbrains';
    if (low.includes('mintty') || low.includes('bash') || low.includes('wsl')) return 'bash';
    if (low.includes('powershell') || low.includes('pwsh') || low.includes('cmd')) return 'shell';
    if (low.includes('terminal') || low.includes('conemu') || low.includes('cmder') || low.includes('alacritty') || low.includes('wezterm')) return 'terminal';
    return 'other';
  }

  // ============== Audio chime ==============
  let audioCtx = null;
  let soundOn = true;
  let notifyOn = (localStorage.getItem('notifyOn') ?? 'true') === 'true';
  function ensureCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    return audioCtx;
  }
  function playTones(notes, type = 'sine', peakGain = 0.18) {
    if (!soundOn) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = n.f;
      const start = ctx.currentTime + n.t;
      const dur = n.d || 0.30;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(start); osc.stop(start + dur + 0.05);
    });
  }
  function chime()           { playTones([{ f: 659.25, t: 0 }, { f: 880.00, t: 0.12 }], 'sine', 0.18); }
  function chimeCompletion() { playTones([{ f: 783.99, t: 0, d: 0.20 }, { f: 1046.50, t: 0.10, d: 0.22 }], 'sine', 0.10); }
  function chimeFailure()    { playTones([{ f: 329.63, t: 0, d: 0.28 }, { f: 220.00, t: 0.14, d: 0.32 }], 'triangle', 0.16); }

  // ============== Refresh button ==============
  const refreshBtn = $('#refresh-btn');
  let refreshSpinTimer = null;
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.style.color = 'var(--accent)';
    const svg = refreshBtn.querySelector('svg');
    if (svg) {
      svg.style.transition = 'transform 0.6s linear';
      svg.style.transform = 'rotate(360deg)';
      clearTimeout(refreshSpinTimer);
      refreshSpinTimer = setTimeout(() => { svg.style.transition = ''; svg.style.transform = ''; }, 650);
    }
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        pushToast({ title: '已重新整理', msg: `${data.sessionsAfter} 個 session（之前 ${data.sessionsBefore} 個）` });
        // Server will push a fresh snapshot via WS within ~400ms
      } else {
        pushToast({ title: '重新整理失敗', msg: data.error || `HTTP ${res.status}` });
      }
    } catch (err) {
      pushToast({ title: '重新整理失敗', msg: err.message });
    } finally {
      setTimeout(() => { refreshBtn.disabled = false; refreshBtn.style.color = ''; }, 800);
    }
  });

  // ============== Cleanup button ==============
  const cleanupBtn = $('#cleanup-btn');
  cleanupBtn.addEventListener('click', async () => {
    if (!confirm('清掃已死 session 留下的檔案？\n\n會刪除：\n  • dead pid 的 marker (<pid>.json)\n  • 已不活 session 的 statusline tmp 檔\n  • 已不活 session 的 waiting/stop flag\n\n不會動你的自訂名稱 (*.dashboard.json)。')) return;
    cleanupBtn.disabled = true;
    cleanupBtn.style.color = 'var(--accent)';
    try {
      const res = await fetch('/api/cleanup', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        const errSuffix = data.errors?.length ? `（${data.errors.length} 個錯誤）` : '';
        pushToast({ title: '清掃完成', msg: `刪了 ${data.deletedCount} 個檔案${errSuffix}` });
      } else {
        pushToast({ title: '清掃失敗', msg: data.error || `HTTP ${res.status}` });
      }
    } catch (err) {
      pushToast({ title: '清掃失敗', msg: err.message });
    } finally {
      setTimeout(() => { cleanupBtn.disabled = false; cleanupBtn.style.color = ''; }, 600);
    }
  });

  // ============== Open Claude web (F19) ==============
  $('#open-claude-btn').addEventListener('click', () => {
    window.open('https://claude.ai/new', '_blank', 'noopener');
  });

  // ============== Collapse all expanded cards (F20) ==============
  // Collapses every currently-expanded card and persists each via setCollapsed.
  // Intentionally does NOT clear needs-attention pulses (unlike a single head click).
  $('#collapse-all-btn').addEventListener('click', () => {
    $$('#sessions .card[data-collapsed="false"]').forEach(card => {
      card.setAttribute('data-collapsed', 'true');
      const sid = card.getAttribute('data-sid');
      if (sid && wsSend) wsSend({ type: 'setCollapsed', sid, collapsed: true });
    });
  });

  $('#sound-toggle').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.style.color = soundOn ? '' : 'var(--text-faint)';
    e.currentTarget.style.background = soundOn ? '' : 'var(--surface-2)';
    if (soundOn) chime();
  });

  // ============== Notification permission ==============
  const banner = $('#perm-banner');
  if (!('Notification' in window) || Notification.permission !== 'default') {
    banner.classList.add('hidden');
  }
  $('#perm-enable').addEventListener('click', () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(p => {
        banner.classList.add('hidden');
        if (p === 'granted') {
          new Notification('通知已啟用', { body: '當 session 需要您決定時會立即提醒。', silent: true });
        }
      });
    }
  });
  $('#perm-dismiss').addEventListener('click', () => banner.classList.add('hidden'));

  function pushNotif(title, body) {
    if (!notifyOn) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, silent: true }); } catch(e) {}
    }
  }

  // ============== Settings panel (gear dropdown) ==============
  const settingsBtn = $('#settings-btn');
  const settingsPanel = $('#settings-panel');
  const notifyToggle = $('#notify-toggle');
  function syncNotifyToggle() {
    notifyToggle.classList.toggle('on', notifyOn);
    notifyToggle.setAttribute('aria-checked', notifyOn ? 'true' : 'false');
  }
  syncNotifyToggle();
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (settingsPanel.classList.contains('hidden')) return;
    if (!e.target.closest('#settings-panel') && !e.target.closest('#settings-btn')) {
      settingsPanel.classList.add('hidden');
    }
  });
  notifyToggle.addEventListener('click', () => {
    notifyOn = !notifyOn;
    localStorage.setItem('notifyOn', notifyOn ? 'true' : 'false');
    syncNotifyToggle();
    if (notifyOn && 'Notification' in window) {
      if (Notification.permission === 'default') Notification.requestPermission();
      else if (Notification.permission === 'denied') pushToast({ title: '通知被瀏覽器封鎖', msg: '請到瀏覽器網站設定允許此頁的通知' });
    }
  });

  // ============== F16: auto-approve build/test/install control ==============
  const aabToggle = $('#aab-toggle'), aabPersist = $('#aab-persist'), aabHint = $('#aab-hint');

  function renderAab({ hookInstalled, state }) {
    const disabled = !hookInstalled;
    aabToggle.disabled = disabled; aabPersist.disabled = disabled;
    aabToggle.style.opacity = disabled ? '.4' : '';
    aabHint.textContent = disabled ? '需先跑 install-hooks.ps1（hook 未安裝）'
                                   : (state === 'permanent' ? '永久套用中' : state === 'session' ? '本次有效' : '關（每次都會問）');
    const on = state === 'session' || state === 'permanent';
    aabToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    aabToggle.classList.toggle('on', on);
    aabPersist.checked = state === 'permanent';
  }

  async function loadAab() {
    try { const r = await fetch('/api/auto-approve-build'); renderAab(await r.json()); } catch {}
  }
  async function setAab(state) {
    try {
      const r = await fetch('/api/auto-approve-build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }),
      });
      const d = await r.json();
      if (!r.ok) { pushToast({ title: '設定失敗', msg: d.error || '' }); return; }
      const hook = await (await fetch('/api/auto-approve-build')).json();
      renderAab(hook);
      if (state === 'permanent') pushToast({ title: '自動核准：永久', msg: 'build/test/install 跨重啟自動核准（可隨時關）' });
      else if (state === 'session') pushToast({ title: '自動核准：本次', msg: '關 dashboard 後自動失效' });
    } catch (err) { pushToast({ title: '設定失敗', msg: err.message }); }
  }

  aabToggle.addEventListener('click', () => {
    if (aabToggle.disabled) return;
    const on = aabToggle.classList.contains('on');
    setAab(on ? 'off' : (aabPersist.checked ? 'permanent' : 'session'));
  });
  aabPersist.addEventListener('change', () => {
    if (aabPersist.disabled) return;
    const on = aabToggle.classList.contains('on');
    if (!on) return;                          // checkbox 只在已開時切換永久/本次
    setAab(aabPersist.checked ? 'permanent' : 'session');
  });
  loadAab();

  // ============== Toast ==============
  function pushToast({ title, msg }) {
    const stack = $('#toast-stack');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <div class="t-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2a4 4 0 0 0-4 4v3l-1.5 2h11L12 9V6a4 4 0 0 0-4-4Z"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0"/></svg>
      </div>
      <div class="t-body">
        <div class="t-title">${escapeHtml(title)}</div>
        <div class="t-msg">${escapeHtml(msg)}</div>
      </div>
      <button class="t-close" aria-label="dismiss">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
      </button>
    `;
    el.querySelector('.t-close').addEventListener('click', () => el.remove());
    stack.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 8000);
  }

  // ============== Tab title / favicon flashing ==============
  const originalTitle = document.title;
  const faviconEl = $('#favicon');
  const faviconNormal = faviconEl.getAttribute('href');
  const faviconAlert = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="8" fill="#c9781f"/>' +
    '<circle cx="16" cy="16" r="6" fill="#fff"/>' +
    '</svg>'
  );
  const faviconCompleted = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="8" fill="#4a7c4f"/>' +
    '<path d="M9 16l5 5 9-11" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>'
  );
  const faviconFailed = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="8" fill="#8a3a2a"/>' +
    '<path d="M11 11l10 10M21 11l-10 10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '</svg>'
  );
  let flashTimer = null;
  let flashOn = false;
  let briefFlashTimer = null;
  function startFlash(waitingCount) {
    if (flashTimer) clearInterval(flashTimer);
    if (briefFlashTimer) { clearInterval(briefFlashTimer); briefFlashTimer = null; }
    const alertTitle = `⚠ (${waitingCount}) 等待您決定 — Sessions`;
    flashTimer = setInterval(() => {
      flashOn = !flashOn;
      document.title = flashOn ? alertTitle : originalTitle;
      faviconEl.setAttribute('href', flashOn ? faviconAlert : faviconNormal);
    }, 1200);
  }
  function stopFlash() {
    if (flashTimer) clearInterval(flashTimer);
    flashTimer = null;
    document.title = originalTitle;
    if (!briefFlashTimer) faviconEl.setAttribute('href', faviconNormal);
  }
  function briefFlash(times, kind) {
    if (flashTimer) return; // continuous waiting flash takes precedence
    if (briefFlashTimer) clearInterval(briefFlashTimer);
    const alt = kind === 'failed' ? faviconFailed : faviconCompleted;
    let counter = 0;
    briefFlashTimer = setInterval(() => {
      counter++;
      const on = counter % 2 === 1;
      faviconEl.setAttribute('href', on ? alt : faviconNormal);
      if (counter >= times * 2) {
        clearInterval(briefFlashTimer);
        briefFlashTimer = null;
        faviconEl.setAttribute('href', faviconNormal);
      }
    }, 450);
  }
  function updateAttention() {
    const waiting = $$('.card[data-status="waiting"]:not(.is-hidden)').length;
    if (waiting > 0) startFlash(waiting); else stopFlash();
  }
  window.addEventListener('focus', () => {
    if (flashTimer) {
      document.title = originalTitle;
      faviconEl.setAttribute('href', faviconNormal);
    }
  });
  window.addEventListener('blur', () => updateAttention());

  // ============== Live data model ==============
  const sessionsContainer = $('#sessions');
  const liveSessions = new Map();    // sid -> session snapshot
  const prevStatuses = new Map();    // sid -> previous status (for transition detection)
  const turnExpansion = new Map();   // sid -> Map<ts, bool>  (user-explicit toggle state)
  const attentionSids = new Set();   // sids whose latest running→other transition hasn't been acknowledged
  let connected = false;
  let currentFilter = 'all';
  let runtimeTicker = null;
  let pendingRender = false;

  // Branch icon SVG (reused per card)
  const BRANCH_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M4 5.5v5M4 8c0-2 2-3 4-3"/></svg>';
  const CHEV_SVG = '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
  const SA_ICON = '<svg class="sa-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5"/><path d="M8 3v10M3 8h10"/></svg>';

  function renderSubagent(sa) {
    const status = sa.status || 'running';
    const label = SUBAGENT_LABEL[status] || status;
    const name = escapeHtml(sa.name || 'agent');
    const desc = sa.description ? ` <span style="color:var(--text-faint); margin-left:6px;">${escapeHtml(sa.description.slice(0,40))}</span>` : '';
    return `<div class="subagent">${SA_ICON}<span class="sa-name">${name}${desc}</span><span class="sa-status ${status}">${label}</span></div>`;
  }

  function turnPreviewText(turn) {
    const t = (turn.user || '').replace(/\s+/g, ' ').trim();
    return t.length > 140 ? t.slice(0, 140) + '…' : t;
  }
  function turnIsExpanded(sid, ts, isLatest) {
    const m = turnExpansion.get(sid);
    if (m && m.has(ts)) return m.get(ts);
    return isLatest;
  }

  // F11: token consumption per turn, in 萬 (W) units — 32000 → "3.2W".
  function formatTokensW(n) {
    return (n / 10000).toFixed(1) + 'W';
  }
  // White ('tk-pending') while the turn is still being processed (not done, or no
  // usage yet); otherwise coloured by total new+generated tokens this turn.
  function tokenTier(tokens, done) {
    if (!done || tokens == null) return 'tk-pending';
    if (tokens < 10000)  return 'tk-green';
    if (tokens < 25000)  return 'tk-cyan';
    if (tokens < 50000)  return 'tk-yellow';
    if (tokens < 100000) return 'tk-orange';
    return 'tk-red';
  }

  function renderTurn(sid, turn, isLatest, idx) {
    const tsHHMM = turn.ts ? formatHHMM(turn.ts) : '';
    const expanded = turnIsExpanded(sid, turn.ts || 0, isLatest);
    const userFull = escapeHtml(turn.user || '');
    const asstFull = escapeHtml(turn.assistant || '');
    const tools = Array.isArray(turn.tools) ? turn.tools.slice(0, 8) : [];
    const toolsHtml = tools.length
      ? `<div class="turn-tools">${tools.map(t => `<span class="tool-chip"><code>${escapeHtml(t.name || '')}</code>${t.detail ? ' ' + escapeHtml(String(t.detail).slice(0, 60)) : ''}</span>`).join('')}</div>`
      : '';
    const preview = escapeHtml(turnPreviewText(turn)) || '<span style="color:var(--text-faint)">(空白)</span>';
    const toolBadge = tools.length ? `<span>${tools.length} tools</span>` : '';
    const userBody = userFull || '<span style="color:var(--text-faint)">(空白)</span>';
    const asstBody = asstFull || '<span style="color:var(--text-faint)">(thinking…)</span>';

    const tkVal = (typeof turn.tokens === 'number') ? turn.tokens : null;
    const tkTitle = tkVal != null
      ? `本輪 ${tkVal.toLocaleString()} tokens（input + cache_creation + output，不含 cache_read）${turn.done ? '' : ' · 處理中'}`
      : '尚未處理完';
    const tokensHtml = `<span class="turn-tokens ${tokenTier(tkVal, turn.done)}" title="${escapeHtml(tkTitle)}">👁 ${tkVal != null ? formatTokensW(tkVal) : '··'}</span>`;

    return `
      <div class="turn ${isLatest ? 'is-latest' : ''}" data-collapsed="${expanded ? 'false' : 'true'}" data-ts="${turn.ts || 0}">
        <div class="turn-head">
          <span class="turn-ts">${tsHHMM}</span>
          ${tokensHtml}
          <span class="turn-preview">${preview}</span>
          <span class="turn-badges">${toolBadge}</span>
          <svg class="turn-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
        </div>
        <div class="turn-body">
          <div class="turn-user"><span class="turn-tag">You</span>${userBody}</div>
          <div class="turn-assistant"><span class="turn-tag tag-asst">Claude</span>${asstBody}</div>
          ${toolsHtml}
        </div>
      </div>`;
  }

  function renderConversation(sid, s) {
    const history = Array.isArray(s.history) ? s.history : [];
    const total = s.totalTurns ?? history.length;
    const viewedSince = Number(s.viewedSince) || 0;

    if (history.length === 0) {
      const promptText = s.prompt?.text ? escapeHtml(s.prompt.text) : '<span style="color:var(--text-faint)">尚無 prompt</span>';
      const summaryText = s.summary?.text ? escapeHtml(s.summary.text) : '<span style="color:var(--text-faint)">(尚無摘要)</span>';
      return `
        <div class="block prompt">
          <div class="block-label">Your prompt</div>
          <div class="prompt-text">${promptText}</div>
        </div>
        <div class="block summary">
          <div class="block-label">Agent · distilled</div>
          <div class="summary-text">${summaryText}</div>
        </div>`;
    }

    const visible = viewedSince > 0 ? history.filter(t => (t.ts || 0) >= viewedSince) : history;
    const hiddenCount = history.length - visible.length;

    const turnsHtml = visible.length
      ? visible.map((t, i) => renderTurn(sid, t, i === visible.length - 1, i)).join('')
      : '<div style="padding:18px 4px; color:var(--text-faint); font-size:12.5px; font-family:var(--font-mono); text-align:center;">— 已隱藏舊對話，等待新一輪 —</div>';

    const labelExtra = total > history.length
      ? `<span style="color:var(--text-faint); margin-left:6px; text-transform:none; letter-spacing:0; font-weight:400;">顯示最新 ${history.length} / 共 ${total}</span>`
      : '';

    const actionBtn = viewedSince === 0
      ? `<button class="conv-btn" data-action="hide-history" title="把目前的對話標為起點，新一輪 prompt 才會顯示">▽ /clear 起點</button>`
      : `<button class="conv-btn" data-action="reset-view" title="重新顯示全部歷史">↩ 還原</button>`;

    const hiddenBanner = hiddenCount > 0
      ? `<div class="hidden-banner" data-action="reset-view">▼ ${hiddenCount} 個更早的 turn 已隱藏 — 點此顯示</div>`
      : '';

    return `
      <div class="block conversation">
        <div class="block-label">
          Conversation (${total} turn${total === 1 ? '' : 's'})
          ${labelExtra}
          <span class="conv-actions">${actionBtn}</span>
        </div>
        <div class="turns">${hiddenBanner}${turnsHtml}</div>
      </div>`;
  }

  function renderCurrentBlock(s) {
    if (s.status === 'failed' && s.lastError) {
      return `
        <div class="block current">
          <div class="block-label">Last error</div>
          <div class="current-task" style="background:var(--error-soft); border-color:rgba(138,58,42,0.2); color:var(--error);">
            <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 11h.01"/></svg>
            <span>${escapeHtml(s.lastError)}</span>
          </div>
        </div>`;
    }
    if (s.status === 'waiting') {
      const text = s.waitingPrompt || s.summary?.text || 'assistant 已停止，等待您下一步指示';
      return `
        <div class="block decision">
          <div class="block-label">Waiting for you</div>
          <div class="decision-box">${escapeHtml(text)}</div>
        </div>`;
    }
    if (s.currentTask) {
      const detail = escapeHtml(s.currentTask.detail || '');
      const tool = escapeHtml(s.currentTask.tool || '');
      return `
        <div class="block current">
          <div class="block-label">Currently</div>
          <div class="current-task">
            <span class="spinner"></span>
            <span><code>${tool}</code> · ${detail}</span>
          </div>
        </div>`;
    }
    return '';
  }

  function renderCard(s) {
    const status = s.status || 'running';
    const collapsed = s.collapsed === true;
    const isWaiting = status === 'waiting';
    const isCompleted = status === 'completed';
    const isFailed = status === 'failed';
    const name = escapeHtml(s.name || s.sid.slice(0,8));
    const cwd = escapeHtml(s.cwdDisplay || s.cwd || '');
    const branch = escapeHtml(s.branch || 'main');
    const started = s.startedAt ? formatHHMM(s.startedAt) : '—';
    const active = s.lastActivity ? formatRelative(s.lastActivity) : 'just now';
    const runtime = formatRuntime(s.runtimeMs);
    const statusLabel = status === 'custom' ? (s.manualStatusText || 'Custom') : (STATUS_LABEL[status] || status);

    const modelPill = s.modelLabel
      ? `<span class="sep">·</span><span class="model-pill">${escapeHtml(s.modelLabel)}</span>` : '';
    const permPill = s.permissionMode
      ? `<span class="sep">·</span><span class="perm-pill" data-mode="${escapeHtml(s.permissionMode)}">${escapeHtml(PERM_LABEL[s.permissionMode] || s.permissionMode)}</span>` : '';
    const hostDisplay = s.hostLabel || s.entrypointLabel;
    const hostKind = s.hostName ? hostKindFromName(s.hostName) : (s.entrypoint || '');
    const hostTooltip = s.hostName ? `host: ${s.hostName} (entrypoint: ${s.entrypoint || 'n/a'})` : `entrypoint: ${s.entrypoint || 'n/a'} · 找不到祖先視窗`;
    const hostPillHead = hostDisplay
      ? `<div class="host-cluster">
        <span class="host-pill" data-host="${escapeHtml(hostKind)}" title="${escapeHtml(hostTooltip)}">${escapeHtml(hostDisplay)}</span>
        <button class="host-act" data-action="focus" title="開啟/聚焦該視窗">開啟視窗</button>
        <button class="host-act" data-action="flash" title="閃該視窗的工作列">閃工作列</button>
      </div>` : '';

    const stateClass = isWaiting ? 'is-waiting'
                     : isCompleted ? 'is-completed'
                     : isFailed ? 'is-failed-state'
                     : status === 'pending' ? 'is-pending'
                     : status === 'custom' ? 'is-custom' : '';

    const attentionClass = attentionSids.has(s.sid) && status !== 'running' ? 'needs-attention' : '';

    const subAgents = s.subAgents || [];
    const subAgentsHtml = subAgents.length
      ? subAgents.map(renderSubagent).join('')
      : '<div style="font-size:12px; color:var(--text-faint); padding:6px 0;">— 無 sub-agent —</div>';

    const tokensUsed = s.tokens?.used || 0;

    return `
<article class="card ${stateClass} ${attentionClass}" data-collapsed="${collapsed}" data-status="${status}" data-sid="${escapeHtml(s.sid)}">
  ${s.cwdLeaf ? `<span class="folder-label">${escapeHtml(s.cwdLeaf)}</span>` : ''}
  ${hostPillHead}
  <header class="card-head">
    ${CHEV_SVG}
    <div class="head-main">
      <div class="name-row">
        ${s.sharedCwd ? `<span class="shared-cwd-badge" title="同一個 cwd 有多個 Claude session 在跑 — /clear 後的 JSONL 自動切換暫時關閉以避免錯配。focus / flash 仍然準確。">shared cwd</span>` : ''}
        <span class="session-name" contenteditable="true" spellcheck="false">${name}</span>
        <span class="rename-hint">click to rename</span>
      </div>
      <div class="meta-rows">
        <div class="meta-row">
          <span class="path">${cwd}</span>
          <span class="sep">·</span>
          <span class="branch">${BRANCH_SVG}${branch}</span>
          ${modelPill}
          ${permPill}
        </div>
        <div class="meta-row meta-row-2">
          <span>started ${started}</span>
          <span class="sep">·</span>
          <span class="meta-active" data-last-activity="${s.lastActivity || 0}">active ${active}</span>
        </div>
      </div>
    </div>
    <div class="status-cluster">
      <span class="status ${status}" title="${s.statusOverridden ? 'manual override' : 'auto-detected'}">
        <span class="dot"></span>${statusLabel}${s.statusOverridden ? '<span class="status-override-tag">manual</span>' : ''}
      </span>
      <div class="status-actions">
        <select class="status-select" title="手動設定狀態（新對話進來會自動解除）">
          <option value="">＋ 標記狀態…</option>
          <option value="completed">已完成</option>
          <option value="pending">待定</option>
          <option value="running">執行中</option>
          <option value="failed">錯誤</option>
          <option value="__custom">✎ 自訂文字…</option>
        </select>
        <button class="mini-action" data-action="resetState" title="清掉手動 override，從 JSONL 整個重算（砍掉重建這個 session 的狀態）">↻ reset</button>
      </div>
    </div>
    <div class="runtime">
      <div class="runtime-time"><span class="label">runtime</span>${runtime}</div>
    </div>
  </header>
  <div class="card-body">
    <div class="body-main">
      ${renderConversation(s.sid, s)}
      ${renderCurrentBlock(s)}
    </div>
    <aside class="body-side">
      <div>
        <div class="subagents-head">Sub-agents (${subAgents.length})</div>
        ${subAgentsHtml}
      </div>
      <div class="side-block">
        <div class="side-label">Tokens used</div>
        <div class="side-value">${tokensUsed.toLocaleString()} <span style="color:var(--text-faint)">cumulative</span></div>
      </div>
      ${typeof s.ctxRemainPct === 'number' ? `
      <div class="side-block">
        <div class="side-label">Ctx remain</div>
        <div class="side-value">${s.ctxRemainPct}% <span style="color:var(--text-faint)">left</span></div>
        <div class="token-bar"><div class="fill ${healthClass(s.ctxRemainPct)}" style="width:${s.ctxRemainPct}%"></div></div>
      </div>` : ''}
      <div class="side-block">
        <div class="side-label">PID</div>
        <div class="side-value faded">${s.pid || '—'}</div>
      </div>
      <div class="actions">
        <button class="action-btn primary" data-action="focus"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>切到 ${escapeHtml(s.hostLabel || s.entrypointLabel || '視窗')}</button>
      </div>
      <div class="actions">
        <button class="action-btn" data-action="flash" title="閃對應 host 視窗的工作列（多視窗時用來辨識是哪個）">⚡ 閃工作列</button>
        <button class="action-btn danger" data-action="terminate"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>終止</button>
      </div>
      <div class="send-prompt">
        <textarea class="send-prompt-input" rows="2" spellcheck="false" placeholder="送 prompt 到此 session…（複製+聚焦+貼上，自行按 Enter 送出）"></textarea>
        <div class="send-prompt-row">
          <button class="action-btn mic-btn" data-mic title="語音輸入（zh-TW，填入後自行檢查送出）" hidden>🎤 語音</button>
          <button class="action-btn send-prompt-btn">✎ 送出 prompt</button>
        </div>
      </div>
    </aside>
  </div>
</article>`;
  }

  function sortSessions(arr) {
    const order = { waiting: 0, running: 1, completed: 2, failed: 3 };
    return arr.slice().sort((a, b) => {
      const da = order[a.status] ?? 9;
      const db = order[b.status] ?? 9;
      if (da !== db) return da - db;
      return (b.lastActivity || 0) - (a.lastActivity || 0);
    });
  }

  function renderAll() {
    // Pause render while user is editing a session name (otherwise their typing gets wiped)
    if (document.activeElement?.matches?.('.session-name')) {
      pendingRender = true;
      return;
    }

    // Snapshot scroll positions of each .turns container per-sid so they survive re-render
    const scrollSnapshot = new Map();
    sessionsContainer.querySelectorAll('.card').forEach(card => {
      const sid = card.getAttribute('data-sid');
      const t = card.querySelector('.turns');
      if (sid && t) {
        const atBottom = (t.scrollTop + t.clientHeight) >= (t.scrollHeight - 24);
        scrollSnapshot.set(sid, { top: t.scrollTop, atBottom });
      }
    });

    const arr = sortSessions(Array.from(liveSessions.values()));
    if (arr.length === 0) {
      sessionsContainer.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-faint); border:1px dashed var(--border); border-radius:var(--radius);">沒有偵測到 alive 的 Claude session。</div>';
    } else {
      sessionsContainer.innerHTML = arr.map(renderCard).join('');
    }

    // Defer scroll restoration until layout is computed so scrollHeight is accurate
    requestAnimationFrame(() => {
      sessionsContainer.querySelectorAll('.card').forEach(card => {
        const sid = card.getAttribute('data-sid');
        const t = card.querySelector('.turns');
        if (!t) return;
        const prev = scrollSnapshot.get(sid);
        // New cards (no prev entry) AND cards that were near the bottom auto-stick to bottom
        // so the latest turn is visible "at a glance". Only preserve mid-scroll if user
        // explicitly scrolled up to read history.
        if (!prev || prev.atBottom !== false) {
          t.scrollTop = t.scrollHeight;
        } else {
          t.scrollTop = prev.top;
        }
      });
    });

    applyFilter(currentFilter);
    updateStats();
    updateAttention();
    revealMicButtons();
  }

  function updateStats() {
    const sessions = Array.from(liveSessions.values());
    const counts = { all: sessions.length, running: 0, waiting: 0, completed: 0, failed: 0, pending: 0, custom: 0 };
    for (const s of sessions) {
      if (counts[s.status] !== undefined) counts[s.status]++;   // custom 自成一類（B6/A），不再併入 pending
    }
    $('#stat-total').textContent = counts.all;
    $('#stat-running').textContent = counts.running;
    $('#stat-waiting').textContent = counts.waiting;
    $('#stat-done').textContent = counts.completed;
    // chip counts
    $$('.chip').forEach(c => {
      const f = c.getAttribute('data-filter');
      const span = c.querySelector('.count');
      if (span) span.textContent = counts[f] ?? 0;
    });
  }

  function applyFilter(f) {
    currentFilter = f;
    $$('.card').forEach(card => {
      const s = card.getAttribute('data-status');
      const match = f === 'all' || f === s;   // 'custom' chip 經由 f===s 命中（B6/A：不再混入 pending）
      card.classList.toggle('is-hidden', !match);
    });
  }

  function detectTransitionsAndAlert(snapshot) {
    for (const s of snapshot) {
      const prev = prevStatuses.get(s.sid);
      const next = s.status;
      const displayName = s.name || s.sid.slice(0,8);
      if (prev && prev !== next) {
        // Any running → (non-running) transition raises attention; persists until
        // the user collapses the card to acknowledge it.
        if (prev === 'running' && next !== 'running') {
          attentionSids.add(s.sid);
        }
        if (next === 'waiting') {
          chime();
          pushToast({ title: `${displayName} 等待您決定`, msg: (s.summary?.text || '').slice(0, 140) || '請查看該 session' });
          pushNotif(`${displayName} 等待您決定`, (s.summary?.text || '').slice(0, 140));
        } else if (next === 'completed' && prev === 'running') {
          chimeCompletion();
          briefFlash(3, 'completed');
          pushToast({ title: `${displayName} 完成`, msg: (s.summary?.text || '').slice(0, 140) || '可下達下一個指令' });
          pushNotif(`${displayName} 完成`, (s.summary?.text || '').slice(0, 140));
        } else if (next === 'failed') {
          chimeFailure();
          briefFlash(5, 'failed');
          pushToast({ title: `${displayName} 失敗`, msg: s.lastError || '查看詳情' });
          pushNotif(`${displayName} 失敗`, s.lastError || '');
        }
      }
      prevStatuses.set(s.sid, next);
    }
  }

  // ============== Delegation: collapse / rename / actions / filters / turn-toggle / view-watermark ==============
  sessionsContainer.addEventListener('click', (e) => {
    // F15: mic button
    const micBtn = e.target.closest('.mic-btn');
    if (micBtn) {
      const card = micBtn.closest('.card');
      const ta = card?.querySelector('.send-prompt-input');
      if (!ta) return;
      if (micBtn === micBtnActive) stopMic(); else { stopMic(); startMic(micBtn, ta); }
      return;
    }

    // View-watermark controls (hide / reset)
    const sendBtn = e.target.closest('.send-prompt-btn');
    if (sendBtn) {
      e.stopPropagation();
      const card = sendBtn.closest('.card');
      const sid = card?.getAttribute('data-sid');
      const ta = card?.querySelector('.send-prompt-input');
      const text = ta ? ta.value : '';
      if (text.trim()) sendPromptToSession(sid, text).then((ok) => { if (ok && ta) ta.value = ''; });
      return;
    }

    const watermarkBtn = e.target.closest('[data-action="hide-history"], [data-action="reset-view"]');
    if (watermarkBtn) {
      e.stopPropagation();
      const card = watermarkBtn.closest('.card');
      const sid = card?.getAttribute('data-sid');
      const s = sid && liveSessions.get(sid);
      if (!s) return;
      const action = watermarkBtn.getAttribute('data-action');
      let viewedSince = 0;
      if (action === 'hide-history') {
        const history = s.history || [];
        const lastTs = history.length ? (history[history.length - 1].ts || Date.now()) : Date.now();
        viewedSince = lastTs + 1;
      }
      s.viewedSince = viewedSince;
      if (wsSend) wsSend({ type: 'setViewedSince', sid, viewedSince });
      renderAll();
      return;
    }

    // Turn-level collapse toggle — handle first since it's nested inside card-head's siblings
    const turnHead = e.target.closest('.turn-head');
    if (turnHead) {
      e.stopPropagation();
      const turnEl = turnHead.closest('.turn');
      const card = turnEl.closest('.card');
      const sid = card?.getAttribute('data-sid');
      const ts = Number(turnEl.getAttribute('data-ts'));
      const wasCollapsed = turnEl.getAttribute('data-collapsed') === 'true';
      const nextCollapsed = !wasCollapsed;
      turnEl.setAttribute('data-collapsed', String(nextCollapsed));
      if (sid) {
        if (!turnExpansion.has(sid)) turnExpansion.set(sid, new Map());
        turnExpansion.get(sid).set(ts, !nextCollapsed);
      }
      return;
    }

    const head = e.target.closest('.card-head');
    if (head && !e.target.closest('.session-name, .action-btn, .mini-action, .status, .status-select, .btn')) {
      const card = head.closest('.card');
      const cur = card.getAttribute('data-collapsed') === 'true';
      const next = !cur;
      card.setAttribute('data-collapsed', next ? 'true' : 'false');
      const sid = card.getAttribute('data-sid');
      if (sid) {
        // Any click on the card head — collapse OR expand — acknowledges the attention pulse
        if (attentionSids.has(sid)) {
          attentionSids.delete(sid);
          card.classList.remove('needs-attention');
        }
        if (wsSend) wsSend({ type: 'setCollapsed', sid, collapsed: next });
      }
      return;
    }

    const actionBtn = e.target.closest('.action-btn, .mini-action, .host-act');
    if (actionBtn) {
      e.stopPropagation();
      const card = actionBtn.closest('.card');
      const sid = card?.getAttribute('data-sid');
      const action = actionBtn.getAttribute('data-action');

      // Local-only actions (sidecar via WS, no API roundtrip needed)
      if (action === 'resetState') {
        if (!sid) return;
        const s = liveSessions.get(sid);
        if (s) {
          // optimistic: drop any manual override locally; server re-reads & re-pushes
          s.statusOverridden = false;
          if (s.computedStatus) s.status = s.computedStatus;
          renderAll();
        }
        if (wsSend) wsSend({ type: 'resetState', sid });
        pushToast({ title: '已 reset 狀態', msg: '清除手動 override，重新從 JSONL 重算' });
        return;
      }
      if (action === 'markPending') {
        if (!sid) return;
        const s = liveSessions.get(sid);
        if (s) { s.computedStatus = s.computedStatus || s.status; s.status = 'pending'; s.statusOverridden = true; renderAll(); }
        if (wsSend) wsSend({ type: 'markStatus', sid, status: 'pending' });
        pushToast({ title: '已標記暫停', msg: '手動 override；有新對話進來會自動解除' });
        return;
      }
      if (action === 'markCustom') {
        if (!sid) return;
        const s = liveSessions.get(sid);
        const txt = (prompt('自訂狀態文字（手動；新活動會自動解除）:', (s && s.manualStatusText) || '') || '').trim();
        if (!txt) return;
        if (s) { s.computedStatus = s.computedStatus || s.status; s.status = 'custom'; s.manualStatusText = txt.slice(0, 60); s.statusOverridden = true; renderAll(); }
        if (wsSend) wsSend({ type: 'markStatus', sid, status: 'custom', text: txt });
        return;
      }

      handleAction(sid, action, actionBtn.textContent.trim());
      return;
    }
  });

  // Manual status dropdown (F12): set completed/pending/running/failed, or custom text
  // (custom is categorised as 待定/pending). New JSONL activity auto-clears the override.
  sessionsContainer.addEventListener('change', (e) => {
    const sel = e.target.closest('.status-select');
    if (!sel) return;
    const v = sel.value;
    sel.value = '';
    const card = sel.closest('.card');
    const sid = card?.getAttribute('data-sid');
    if (!sid || !v) return;
    const s = liveSessions.get(sid);
    if (v === '__custom') {
      const txt = (prompt('自訂狀態文字（歸類為待定；新活動會自動解除）:', (s && s.manualStatusText) || '') || '').trim();
      if (!txt) return;
      if (s) { s.computedStatus = s.computedStatus || s.status; s.status = 'custom'; s.manualStatusText = txt.slice(0, 60); s.statusOverridden = true; renderAll(); }
      if (wsSend) wsSend({ type: 'markStatus', sid, status: 'custom', text: txt });
    } else {
      if (s) { s.computedStatus = s.computedStatus || s.status; s.status = v; s.statusOverridden = true; renderAll(); }
      if (wsSend) wsSend({ type: 'markStatus', sid, status: v });
    }
  });

  sessionsContainer.addEventListener('focusin', (e) => {
    const name = e.target.closest('.session-name');
    if (name) name.dataset.original = name.textContent;
  });
  sessionsContainer.addEventListener('focusout', (e) => {
    const name = e.target.closest('.session-name');
    if (!name) return;
    const card = name.closest('.card');
    const sid = card?.getAttribute('data-sid');
    const newName = name.textContent.trim();
    if (sid && newName && newName !== name.dataset.original) {
      const s = liveSessions.get(sid);
      if (s) s.name = newName;
      if (wsSend) wsSend({ type: 'rename', sid, name: newName });
    }
    setTimeout(() => {
      if (document.activeElement?.matches?.('.session-name')) return;
      if (pendingRender) { pendingRender = false; renderAll(); }
    }, 50);
  });
  sessionsContainer.addEventListener('keydown', (e) => {
    const name = e.target.closest('.session-name');
    if (!name) return;
    if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
    if (e.key === 'Escape') {
      name.textContent = name.dataset.original || name.textContent;
      name.blur();
    }
  });

  $$('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyFilter(chip.getAttribute('data-filter'));
      updateAttention();
    });
  });

  async function handleAction(sid, action, label) {
    if (!sid) return;
    if (action === 'terminate') {
      if (!confirm(`確定要終止這個 Claude session (sid=${sid.slice(0,8)})？\n會送 SIGTERM 給對應 process。`)) return;
    }
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast({ title: `${label} 失敗`, msg: data.error || `HTTP ${res.status}` });
        return;
      }
      if (data.code === 1 && (data.stdout?.startsWith('NOT_FOUND') || data.stderr)) {
        pushToast({ title: label, msg: '找不到對應的 IDE / terminal 視窗' });
      } else if (action === 'flash' && data.stdout?.startsWith('OK')) {
        pushToast({ title: '已閃工作列', msg: '對應 host 視窗正在閃爍' });
      } else if (action === 'terminate' && data.ok) {
        pushToast({ title: 'Session 已終止', msg: 'process.kill(SIGTERM) 已送出' });
      } else if (data.stdout?.startsWith('OK') || data.ok) {
        // focus success — keep quiet (window already came to front, no need for toast)
      } else {
        pushToast({ title: label, msg: JSON.stringify(data).slice(0, 120) });
      }
    } catch (err) {
      pushToast({ title: `${label} 失敗`, msg: err.message });
    }
  }

  // F4: copy prompt to clipboard + focus the session window + paste (no auto-Enter).
  async function sendPromptToSession(sid, text) {
    if (!sid || !text.trim()) return;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}/sendPrompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { pushToast({ title: '送出 prompt 失敗', msg: data.error || `HTTP ${res.status}` }); return false; }
      const out = data.stdout || '';
      if (out.startsWith('PASTED')) pushToast({ title: '已貼到視窗', msg: '已複製+聚焦+貼上，請在該視窗確認後按 Enter 送出' });
      else if (out.startsWith('COPIED')) pushToast({ title: '已複製 + 聚焦', msg: '自動貼上未成功，請到該視窗手動 Ctrl+V' });
      else pushToast({ title: 'prompt 已處理', msg: '已複製到剪貼簿' });
      return true;
    } catch (err) { pushToast({ title: '送出 prompt 失敗', msg: err.message }); return false; }
  }

  // ============== F15: speech-to-text for the send-prompt textarea ==============
  // (Chrome webkitSpeechRecognition, zh-TW). Fills the textarea; never auto-sends.
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micSupported = !!SpeechRec;
  let micRec = null;        // active recognition instance
  let micBtnActive = null;  // the button currently recording

  function startMic(btn, textarea) {
    if (!micSupported || micRec) return;
    const rec = new SpeechRec();
    rec.lang = 'zh-TW';
    rec.interimResults = true;
    rec.continuous = false;
    const base = textarea.value;            // append onto existing text
    let finalAdd = '';
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const tr = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalAdd += tr; else interim += tr;
      }
      textarea.value = base + finalAdd + interim;
    };
    rec.onerror = (ev) => { pushToast({ title: '語音輸入失敗', msg: ev.error || '辨識錯誤（檢查麥克風權限）' }); };
    rec.onend = () => { micRec = null; if (micBtnActive) { micBtnActive.classList.remove('recording'); micBtnActive.textContent = '🎤 語音'; micBtnActive = null; } };
    micRec = rec; micBtnActive = btn;
    btn.classList.add('recording'); btn.textContent = '⏹ 停止';
    try { rec.start(); } catch (e) { rec.onend(); }
  }
  function stopMic() { if (micRec) { try { micRec.stop(); } catch {} } }

  // after cards are (re)rendered — reveal mic buttons only where supported
  function revealMicButtons() {
    if (!micSupported) return;
    $$('.mic-btn[hidden]').forEach((b) => { b.hidden = false; });
  }

  // ============== Runtime ticker (smooth runtime / relative-time updates) ==============
  function startRuntimeTicker() {
    if (runtimeTicker) return;
    runtimeTicker = setInterval(() => {
      const now = Date.now();
      $$('.card').forEach(card => {
        const sid = card.getAttribute('data-sid');
        const s = liveSessions.get(sid);
        if (!s) return;
        const runtimeEl = card.querySelector('.runtime-time');
        if (runtimeEl) {
          const elapsed = (s.runtimeMs || 0) + (now - (s._receivedAt || now));
          runtimeEl.innerHTML = `<span class="label">runtime</span>${formatRuntime(elapsed)}`;
        }
        const activeEl = card.querySelector('.meta-active');
        if (activeEl) {
          const ts = Number(activeEl.dataset.lastActivity) || 0;
          if (ts) activeEl.textContent = 'active ' + formatRelative(ts);
        }
      });
    }, 1000);
  }

  // ============== Usage quota polling ==============
  const quotaEl = $('#quota-panel');
  const QUOTA_REFRESH_INTERVAL = 30000;
  let lastQuotaData = null;
  let nextQuotaFetchAt = 0;

  // Color a usage bar by remaining headroom (health), not by how much is used:
  // plenty left = green, getting low = amber, nearly out = red.
  function healthClass(remainPct) {
    if (typeof remainPct !== 'number' || isNaN(remainPct)) return 'health-good';
    if (remainPct >= 50) return 'health-good';
    if (remainPct >= 20) return 'health-warn';
    return 'health-crit';
  }

  function quotaItem(label, pct, kind /* 'used' | 'remain' */, ago) {
    if (pct == null) return `<span class="quota-item"><span class="quota-label">${label}</span><span class="quota-reset">n/a</span></span>`;
    const remain = kind === 'remain' ? pct : 100 - pct;
    const agoHtml = ago ? `<span class="quota-reset">· ${ago}</span>` : '';
    return `<span class="quota-item">
      <span class="quota-label">${label}</span>
      <span class="quota-row">
        <span class="quota-bar"><span class="fill ${healthClass(remain)}" style="width:${pct}%"></span></span>
        <span class="quota-value">${pct}%${kind === 'remain' ? ' remain' : ' used'}</span>
        ${agoHtml}
      </span>
    </span>`;
  }

  function formatAgo(s) {
    if (s < 60)    return `${s}s ago`;
    if (s < 3600)  return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
  }

  function renderQuotaPanel() {
    const data = lastQuotaData;
    if (!data || !data.available) {
      quotaEl.className = 'quota-panel unavailable';
      quotaEl.innerHTML = '<span>—— 無 quota 資料：需安裝 statusline hook（5h/7d 配額無法 native 取得，見 SETUP.md）——</span>';
      return;
    }
    const now = Date.now();
    const ageS = Math.max(0, Math.floor((now - (data.refreshedAt || 0)) / 1000));
    const ageLabel = formatAgo(ageS);
    const isStale = ageS > 300;
    const nextInS = Math.max(0, Math.ceil((nextQuotaFetchAt - now) / 1000));

    // quota 補滿時間：resets_at（epoch 秒）→ 本地時刻 + 相對剩餘
    //   今天:  "resets 14:00 (2h29m)"      跨日: "resets 6/5 12:00 (3d0h)"
    const fmtReset = (epochSec) => {
      if (!epochSec) return '';
      const diff = epochSec * 1000 - now;
      if (diff <= 60000) return 'resetting';
      const dt = new Date(epochSec * 1000);
      const clock = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const rel = d > 0 ? `${d}d${h}h` : (h > 0 ? `${h}h${m}m` : `${m}m`);
      // toDateString 含年份 → 換日/換年都正確；日補成 2 格（"6/ 5"）避免位數變動時跳位
      const crossesDay = dt.toDateString() !== new Date(now).toDateString();
      const day = String(dt.getDate()).padStart(2, ' ');
      const stamp = crossesDay ? `${dt.getMonth()+1}/${day} ${clock}` : clock;
      return `resets ${stamp} (${rel})`;
    };

    quotaEl.className = 'quota-panel' + (isStale ? ' unavailable' : '');
    quotaEl.innerHTML = `
      ${quotaItem('5h-limit', data.fiveHRemainPct, 'remain', fmtReset(data.fiveHResetsAt))}
      ${quotaItem('week-limit', data.sevenDRemainPct, 'remain', fmtReset(data.sevenDResetsAt))}
      <span class="quota-reset quota-poll">${isStale ? '(stale) · ' : ''}poll in ${nextInS}s</span>
    `;
  }

  async function fetchQuota() {
    try {
      const res = await fetch('/api/usage', { cache: 'no-store' });
      if (!res.ok) return;
      lastQuotaData = await res.json();
    } catch {}
    nextQuotaFetchAt = Date.now() + QUOTA_REFRESH_INTERVAL;
    renderQuotaPanel();
  }
  fetchQuota();
  setInterval(fetchQuota, QUOTA_REFRESH_INTERVAL);
  // Re-render every second so age + countdown stay live without re-fetching
  setInterval(renderQuotaPanel, 1000);

  // ============== WebSocket client ==============
  let ws = null;
  let wsSend = null;
  let reconnectDelay = 1000;
  let offlineBannerShown = false;
  let shuttingDown = false;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${proto}//${location.host}/`);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
      if (offlineBannerShown) {
        offlineBannerShown = false;
        pushToast({ title: 'Server 已連線', msg: '即時 session 資料已啟動' });
      }
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const now = Date.now();
      if (msg.type === 'snapshot') {
        liveSessions.clear();
        for (const s of msg.sessions) {
          s._receivedAt = now;
          liveSessions.set(s.sid, s);
        }
        detectTransitionsAndAlert(msg.sessions);
        renderAll();
        startRuntimeTicker();
      } else if (msg.type === 'update' && msg.session) {
        msg.session._receivedAt = now;
        liveSessions.set(msg.session.sid, msg.session);
        detectTransitionsAndAlert([msg.session]);
        renderAll();
      } else if (msg.type === 'remove' && msg.sid) {
        liveSessions.delete(msg.sid);
        prevStatuses.delete(msg.sid);
        renderAll();
      } else if (msg.type === 'toast') {
        pushToast({ title: msg.title, msg: msg.msg });
      }
    };
    ws.onclose = () => {
      connected = false;
      ws = null;
      wsSend = null;
      scheduleReconnect();
    };
    ws.onerror = () => {
      if (ws) try { ws.close(); } catch {}
    };
    wsSend = (obj) => { try { ws && ws.send(JSON.stringify(obj)); } catch {} };
  }

  function scheduleReconnect() {
    if (shuttingDown) return;
    if (!offlineBannerShown) {
      offlineBannerShown = true;
      pushToast({ title: 'Server 離線', msg: '無法連到 dashboard server (127.0.0.1:7878)，將自動重連…' });
    }
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
  }

  // ============== F21: new-session folder picker modal ==============
  const fsModal = $('#fs-modal'), fsList = $('#fs-list'), fsCrumb = $('#fs-crumb'),
        fsCurrent = $('#fs-current'), fsOpen = $('#fs-open');
  let fsCurPath = '';

  async function fsLoad(p) {
    try {
      const res = await fetch('/api/fs/list?path=' + encodeURIComponent(p || ''));
      const data = await res.json();
      if (!res.ok) { pushToast({ title: '讀目錄失敗', msg: data.error || '' }); return; }
      fsCurPath = data.path || '';
      fsCurrent.textContent = fsCurPath || '（磁碟機）';
      fsOpen.disabled = !fsCurPath;            // 磁碟機根清單層不可直接開
      if (fsCurPath) localStorage.setItem('fs.lastPath', fsCurPath);
      // breadcrumb: 上層 + 目前
      fsCrumb.innerHTML = '';
      if (data.parent !== null || data.path) {
        const up = document.createElement('button');
        up.className = 'fs-up'; up.textContent = '⬆ 上層';
        up.onclick = () => fsLoad(data.parent === null ? '' : data.parent);
        fsCrumb.appendChild(up);
      }
      // list: drives (root) or dirs
      fsList.innerHTML = '';
      const items = (data.drives && data.drives.length) ? data.drives
        : data.dirs.map((d) => (fsCurPath.endsWith('\\') ? fsCurPath + d : fsCurPath + '\\' + d));
      for (const full of items) {
        const row = document.createElement('button');
        row.className = 'fs-row'; row.textContent = '📁 ' + full.replace(/\\$/, '').split('\\').pop() || full;
        row.title = full;
        row.onclick = () => fsLoad(full);
        fsList.appendChild(row);
      }
      if (!items.length) fsList.innerHTML = '<div class="fs-empty">（無子資料夾）</div>';
    } catch (err) { pushToast({ title: '讀目錄失敗', msg: err.message }); }
  }

  $('#new-session-btn').addEventListener('click', () => {
    fsModal.classList.remove('hidden');
    fsLoad(localStorage.getItem('fs.lastPath') || '');
  });
  $('#fs-close').addEventListener('click', () => fsModal.classList.add('hidden'));
  fsModal.addEventListener('click', (e) => { if (e.target === fsModal) fsModal.classList.add('hidden'); });
  fsOpen.addEventListener('click', async () => {
    if (!fsCurPath) return;
    if (!confirm(`將在這個資料夾開新 Claude session：\n${fsCurPath}`)) return;
    try {
      const res = await fetch('/api/launch-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: fsCurPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) { pushToast({ title: '已開新 session', msg: fsCurPath }); fsModal.classList.add('hidden'); }
      else pushToast({ title: '開新 session 失敗', msg: data.error || `HTTP ${res.status}` });
    } catch (err) { pushToast({ title: '開新 session 失敗', msg: err.message }); }
  });

  // ============== Restart dashboard (F19) ==============
  $('#restart-btn').addEventListener('click', async () => {
    if (!confirm('重啟 dashboard server？\n\n會起一個新 process 取代目前的；畫面會短暫斷線後自動連回。')) return;
    let ok = false;
    try { const r = await fetch('/api/restart', { method: 'POST' }); ok = r.ok; } catch {}
    if (!ok) { pushToast({ title: '重啟失敗', msg: 'server 沒回應 /api/restart（可能還是舊版 process）—— 請先重啟一次 server 載入新版' }); return; }
    pushToast({ title: '重啟中…', msg: 'server 正在重啟，連線會自動恢復（會短暫顯示離線）' });
    // 不設 shuttingDown —— 讓既有 scheduleReconnect 在新 server 起來後自動連回
  });

  // ============== Shutdown dashboard (F12) ==============
  $('#shutdown-btn').addEventListener('click', async () => {
    if (!confirm('關閉整個 dashboard server？\n\n會終止 node 程序、所有即時監看停止。\nautostart 只在 Windows 登入時跑 —— 關閉後需手動執行 start-server.cmd / start-server.vbs 再重新整理本頁。')) return;
    let ok = false;
    try { const r = await fetch('/api/shutdown', { method: 'POST' }); ok = r.ok; } catch {}
    if (!ok) { pushToast({ title: '關閉失敗', msg: 'server 沒回應 /api/shutdown（可能還是舊版 process）—— 請先重啟一次 server 載入新版' }); return; }
    shuttingDown = true;
    try { if (ws) ws.close(); } catch {}
    let el = document.getElementById('shutdown-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'shutdown-overlay';
      el.innerHTML = '<div class="shutdown-card"><div class="shutdown-title">Dashboard 已關閉</div>'
        + '<div class="shutdown-msg">server 已終止。重開請執行 <code>start-server.cmd</code> 或 <code>start-server.vbs</code>，再重新整理本頁。</div></div>';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
  });

  connect();
})();
