const MAX_RULES = 100;
const MAX_PATTERN_LEN = 1000;
const MAX_STATUS_TEXT_LEN = 200;
const MAX_CONTENT_TYPE_LEN = 300;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DELAY_MS = 60000;
const HTTP_METHODS = new Set(["", "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

const I18N = {
  ru: {
    app_name: "Request Override",
    language_label: "Язык",
    tab_requests: "Запросы",
    tab_rules: "Правила",
    mode_network: "Сетевой перехват",
    mode_mask: "Маскировать query-параметры",
    status_checking: "Проверка состояния…",
    status_attached: "Сетевой перехват активен для вкладки {tabId}",
    status_off: "Сетевой перехват выключен — режим в странице",
    status_error_detail: "Ошибка: {error}",
    status_no_tab: "Нет активной http(s)-вкладки",
    refresh: "Обновить",
    diagnostics: "Диагностика",
    clear_logs: "Очистить журнал",
    empty_requests: "Запросов пока нет. Выполните fetch/XHR-запросы на странице.",
    empty_rules: "Правил нет. Правый клик по запросу создаст правило.",
    add_rule: "Добавить правило",
    rule_enabled: "Включить правило",
    rule_disabled: "Отключить правило",
    edit_rule: "Изменить",
    delete_rule: "Удалить",
    copy_url: "Скопировать URL",
    copied: "Скопировано",
    collapse_panel: "Свернуть панель",
    expand_panel: "Развернуть панель",
    modal_title_new: "Новое правило",
    modal_title_edit: "Изменить правило",
    url_pattern: "URL-паттерн",
    url_pattern_ph: "https://api.example.com/users/42 или /users/42",
    match_substring: "Подстрока",
    match_regex: "Регулярное выражение",
    method: "Метод",
    any_method: "Любой",
    status_code: "Код статуса",
    status_text: "Статус-текст",
    status_text_ph: "OK, Not Found и т.п.",
    content_type: "Content-Type",
    content_type_ph: "application/json; charset=utf-8",
    body: "Тело ответа",
    body_ph: '{"ok":true}',
    delay: "Задержка, мс",
    enabled: "Включено",
    cancel: "Отмена",
    save_rule: "Сохранить правило",
    close: "Закрыть",
    error_url_required: "Введите URL-паттерн",
    error_status_required: "Код статуса должен быть числом от 100 до 599",
    error_regex: "Некорректное регулярное выражение",
    error_body: "Тело не должно быть больше 1 МБ",
    error_delay: "Задержка должна быть от 0 до 60000 мс",
    error_rules_limit: "Максимум 100 правил",
    error_storage: "Не удалось сохранить данные",
    mocked: "MOCKED",
    any_method_label: "ANY",
    request_aria: "Запрос {method} {name}. Статус {status}, длительность {duration}{mocked}. URL: {url}",
    rule_meta: "{matchType} · {status}{delay}",
    delay_suffix: " мс"
  },
  en: {
    app_name: "Request Override",
    language_label: "Language",
    tab_requests: "Requests",
    tab_rules: "Rules",
    mode_network: "Network-level mock",
    mode_mask: "Mask query params",
    status_checking: "Checking…",
    status_attached: "Network interception active for tab {tabId}",
    status_off: "Network interception off — in-page mode",
    status_error_detail: "Error: {error}",
    status_no_tab: "No active http(s) tab",
    refresh: "Refresh",
    diagnostics: "Diagnostics",
    clear_logs: "Clear logs",
    empty_requests: "No requests yet. Make fetch/XHR requests on the page.",
    empty_rules: "No rules. Right-click a request to create one.",
    add_rule: "Add rule",
    rule_enabled: "Enable rule",
    rule_disabled: "Disable rule",
    edit_rule: "Edit",
    delete_rule: "Delete",
    copy_url: "Copy URL",
    copied: "Copied",
    collapse_panel: "Collapse panel",
    expand_panel: "Expand panel",
    modal_title_new: "New rule",
    modal_title_edit: "Edit rule",
    url_pattern: "URL pattern",
    url_pattern_ph: "https://api.example.com/users/42 or /users/42",
    match_substring: "Substring",
    match_regex: "Regex",
    method: "Method",
    any_method: "Any",
    status_code: "Status code",
    status_text: "Status text",
    status_text_ph: "OK, Not Found, etc.",
    content_type: "Content-Type",
    content_type_ph: "application/json; charset=utf-8",
    body: "Response body",
    body_ph: '{"ok":true}',
    delay: "Delay (ms)",
    enabled: "Enabled",
    cancel: "Cancel",
    save_rule: "Save rule",
    close: "Close",
    error_url_required: "Enter a URL pattern",
    error_status_required: "Status code must be a number from 100 to 599",
    error_regex: "Invalid regular expression",
    error_body: "Body must be at most 1 MB",
    error_delay: "Delay must be between 0 and 60000 ms",
    error_rules_limit: "Maximum 100 rules",
    error_storage: "Failed to save data",
    mocked: "MOCKED",
    any_method_label: "ANY",
    request_aria: "Request {method} {name}. Status {status}, duration {duration}{mocked}. URL: {url}",
    rule_meta: "{matchType} · {status}{delay}",
    delay_suffix: " ms"
  }
};

const state = {
  rules: [],
  logs: [],
  currentTabId: null,
  editingId: null,
  netMode: true,
  maskUrls: false,
  language: "ru",
  collapsed: false,
  netStatus: { ready: false, attached: false, error: null, tabId: null, updatedAt: null },
  lastFocused: null
};

const $ = (id) => document.getElementById(id);
const appShell = $("app-shell");
const panelToggle = $("panel-toggle");
const toggleArrow = $("toggle-arrow");
const stripStatus = $("strip-status");
const stripCount = $("strip-count");
const langSelect = $("lang-select");
const tabRequests = $("tab-requests");
const tabRules = $("tab-rules");
const panelRequests = $("panel-requests");
const panelRules = $("panel-rules");
const netModeCheckbox = $("net-mode");
const maskUrlsCheckbox = $("mask-urls");
const netStatusEl = $("net-status");
const btnRefresh = $("btn-refresh");
const btnDiag = $("btn-diag");
const btnClear = $("btn-clear");
const reqList = $("req-list");
const reqEmpty = $("req-empty");
const btnAddRule = $("btn-add-rule");
const rulesList = $("rules-list");
const rulesEmpty = $("rules-empty");
const modal = $("modal");
const modalTitle = $("modal-title");
const modalClose = $("modal-close");
const urlInput = $("rule-url");
const methodSelect = $("rule-method");
const statusInput = $("rule-status");
const statusTextInput = $("rule-status-text");
const contentTypeInput = $("rule-content-type");
const bodyInput = $("rule-body");
const delayInput = $("rule-delay");
const enabledInput = $("rule-enabled");
const btnCancel = $("btn-cancel");
const btnSaveRule = $("btn-save-rule");
const fieldError = $("field-error");

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncate(value, max = 200) {
  const text = safeString(value, "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function byteLength(value) {
  try {
    return new TextEncoder().encode(safeString(value, "")).length;
  } catch {
    return safeString(value, "").length;
  }
}

function t(key, params = {}) {
  let str = (I18N[state.language] && I18N[state.language][key]) || I18N.en[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.split(`{${k}}`).join(String(v));
  }
  return str;
}

function applyI18n() {
  document.documentElement.lang = state.language;
  document.title = t("app_name");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });

  const currentMethod = methodSelect.value;
  syncMethodSelect();
  methodSelect.value = currentMethod;

  updateCollapseControls();
  renderNetStatus();
  renderRules();
  renderRequests();
}

function normalizeLocalRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  return {
    id: typeof rule.id === "string" && rule.id ? rule.id : crypto.randomUUID(),
    urlPattern: safeString(rule.urlPattern).slice(0, MAX_PATTERN_LEN),
    matchType: rule.matchType === "regex" ? "regex" : "substring",
    method: HTTP_METHODS.has(String(rule.method || "").toUpperCase()) ? String(rule.method || "").toUpperCase() : "",
    status: Number.isInteger(rule.status) && rule.status >= 100 && rule.status <= 599 ? rule.status : 200,
    statusText: safeString(rule.statusText).slice(0, MAX_STATUS_TEXT_LEN),
    contentType: safeString(rule.contentType).slice(0, MAX_CONTENT_TYPE_LEN),
    body: safeString(rule.body).slice(0, MAX_BODY_BYTES),
    delayMs: Number.isFinite(rule.delayMs) ? Math.max(0, Math.min(MAX_DELAY_MS, Math.round(rule.delayMs))) : 0,
    enabled: rule.enabled !== false
  };
}

function normalizeLocalRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.map(normalizeLocalRule).filter(Boolean).slice(0, MAX_RULES);
}

function normalizeLocalLog(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id: entry.id || crypto.randomUUID(),
    method: safeString(entry.method).slice(0, 10) || "GET",
    url: safeString(entry.url).slice(0, 2000),
    status: Number.isFinite(entry.status) ? entry.status : null,
    durationMs: Number.isFinite(entry.durationMs) ? entry.durationMs : null,
    mocked: entry.mocked === true,
    ts: Number.isFinite(entry.ts) ? entry.ts : Date.now()
  };
}

function normalizeLocalLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs.map(normalizeLocalLog).filter(Boolean);
}

function activeRuleCount() {
  return state.rules.filter((r) => r && r.enabled !== false).length;
}

function getRequestName(entry) {
  const url = safeString(entry && entry.url, "");
  try {
    const u = new URL(url, window.location.href);
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length) {
      const name = segments[segments.length - 1];
      return name.length > 48 ? `${name.slice(0, 48)}…` : name;
    }
    const firstQuery = u.searchParams.key(0);
    if (firstQuery) return firstQuery;
    return u.hostname || url;
  } catch {
    const path = url.split("?")[0].split("#")[0];
    const segments = path.split("/").filter(Boolean);
    const name = segments[segments.length - 1] || path || url || "?";
    return name.length > 48 ? `${name.slice(0, 48)}…` : name;
  }
}

function formatDuration(entry) {
  if (Number.isFinite(entry && entry.durationMs)) return `${Math.round(entry.durationMs)} ms`;
  return "—";
}

function methodClass(method) {
  return `m-${String(method || "get").toLowerCase()}`;
}

function statusClass(status) {
  const s = Number(status);
  if (!Number.isFinite(s) || s < 100) return "s-unknown";
  if (s >= 200 && s < 300) return "s-2xx";
  if (s >= 300 && s < 400) return "s-3xx";
  if (s >= 400 && s < 500) return "s-4xx";
  if (s >= 500) return "s-5xx";
  return "s-unknown";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    ta.remove();
  }
}

function showStorageError() {
  netStatusEl.textContent = t("error_storage");
}

function renderRequests() {
  reqList.textContent = "";
  reqEmpty.classList.toggle("hidden", state.logs.length > 0);

  for (const entry of state.logs) {
    const method = entry.method || "GET";
    const name = getRequestName(entry);
    const status = entry.status == null ? "—" : String(entry.status);
    const duration = formatDuration(entry);
    const mocked = entry.mocked === true;
    const aria = t("request_aria", {
      method,
      name,
      status,
      duration,
      mocked: mocked ? `, ${t("mocked")}` : "",
      url: truncate(entry.url, 200)
    });

    const row = document.createElement("div");
    row.className = "req-row";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.setAttribute("aria-label", aria);
    row.innerHTML = `
      <div class="req-main">
        <span class="req-method ${methodClass(method)}">${escapeHtml(method)}</span>
        <span class="req-name">${escapeHtml(name)}</span>
        <span class="req-status ${statusClass(entry.status)}">${escapeHtml(status)}</span>
        <span class="req-dur">${escapeHtml(duration)}</span>
        ${mocked ? `<span class="req-mock">${escapeHtml(t("mocked"))}</span>` : ""}
      </div>
      <div class="req-sub">
        <span class="req-url" title="${escapeHtml(entry.url)}">${escapeHtml(entry.url)}</span>
        <button class="copy-url" type="button" title="${escapeHtml(t("copy_url"))}" aria-label="${escapeHtml(t("copy_url"))}">⧉</button>
      </div>
    `;

    row.addEventListener("click", () => openModal(entry));
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openModal(entry);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(entry);
      }
    });

    const copyBtn = row.querySelector(".copy-url");
    copyBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await copyText(entry.url);
      copyBtn.textContent = "✓";
      setTimeout(() => {
        copyBtn.textContent = "⧉";
      }, 1200);
    });

    reqList.appendChild(row);
  }
}

function renderRules() {
  rulesList.textContent = "";
  rulesEmpty.classList.toggle("hidden", state.rules.length > 0);
  stripCount.textContent = String(activeRuleCount());

  for (const rule of state.rules) {
    const enabled = rule.enabled !== false;
    const row = document.createElement("div");
    row.className = "rule-row";

    const toggle = document.createElement("label");
    toggle.className = "check";
    toggle.innerHTML = `
      <input type="checkbox" ${enabled ? "checked" : ""} aria-label="${escapeHtml(enabled ? t("rule_enabled") : t("rule_disabled"))}" />
      <span class="box" aria-hidden="true"></span>
    `;
    toggle.querySelector("input").addEventListener("change", (event) => {
      setRuleEnabled(rule.id, event.target.checked);
    });

    const info = document.createElement("div");
    info.className = "rule-info";

    const matchKey = rule.matchType === "regex" ? "match_regex" : "match_substring";
    const delayText = rule.delayMs ? ` · ${rule.delayMs}${t("delay_suffix")}` : "";
    info.innerHTML = `
      <div class="rule-summary">
        <span class="rule-method">${escapeHtml(rule.method || t("any_method_label"))}</span>
        <span class="rule-status ${statusClass(rule.status)}">${escapeHtml(String(rule.status))}</span>
        <code class="rule-pattern" title="${escapeHtml(rule.urlPattern)}">${escapeHtml(rule.urlPattern)}</code>
      </div>
      <div class="rule-meta">${escapeHtml(t("rule_meta", {
        matchType: t(matchKey),
        status: rule.status,
        delay: delayText
      }))}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "rule-actions";
    actions.innerHTML = `
      <button class="btn" type="button" data-i18n="${"edit_rule"}">${escapeHtml(t("edit_rule"))}</button>
      <button class="btn" type="button" data-i18n="${"delete_rule"}">${escapeHtml(t("delete_rule"))}</button>
    `;
    actions.querySelector('button[data-i18n="edit_rule"]').addEventListener("click", () => editRule(rule));
    actions.querySelector('button[data-i18n="delete_rule"]').addEventListener("click", () => deleteRule(rule.id));

    row.append(toggle, info, actions);
    rulesList.appendChild(row);
  }
}

async function loadRules() {
  try {
    const res = await chrome.storage.local.get("rm_rules");
    state.rules = normalizeLocalRules(res.rm_rules || []);
  } catch (err) {
    state.rules = [];
    showStorageError();
    console.error(err);
  }
  renderRules();
}

async function loadSettings() {
  try {
    const res = await chrome.storage.local.get(["rm_rules", "rm_net_mode", "rm_mask_urls", "rm_language", "rm_panel_collapsed"]);
    state.rules = normalizeLocalRules(res.rm_rules || []);
    state.netMode = res.rm_net_mode !== false;
    state.maskUrls = res.rm_mask_urls === true;
    state.language = res.rm_language === "en" ? "en" : "ru";
    state.collapsed = res.rm_panel_collapsed === true;
  } catch (err) {
    console.error(err);
    showStorageError();
  }

  netModeCheckbox.checked = state.netMode;
  maskUrlsCheckbox.checked = state.maskUrls;
  langSelect.value = state.language;
  applyI18n();
}

async function setRuleEnabled(id, enabled) {
  const next = state.rules.map((r) => (r.id === id ? { ...r, enabled } : r));
  try {
    await chrome.storage.local.set({ rm_rules: next });
    state.rules = next;
    renderRules();
  } catch (err) {
    showStorageError();
    console.error(err);
  }
}

async function deleteRule(id) {
  const next = state.rules.filter((r) => r.id !== id);
  try {
    await chrome.storage.local.set({ rm_rules: next });
    state.rules = next;
    renderRules();
  } catch (err) {
    showStorageError();
    console.error(err);
  }
}

async function loadNetMode() {
  try {
    const res = await chrome.storage.local.get("rm_net_mode");
    state.netMode = res.rm_net_mode !== false;
  } catch {
    state.netMode = true;
  }
  netModeCheckbox.checked = state.netMode;
}

async function loadMaskUrls() {
  try {
    const res = await chrome.storage.local.get("rm_mask_urls");
    state.maskUrls = res.rm_mask_urls === true;
  } catch {
    state.maskUrls = false;
  }
  maskUrlsCheckbox.checked = state.maskUrls;
}

async function loadLanguage() {
  try {
    const res = await chrome.storage.local.get("rm_language");
    state.language = res.rm_language === "en" ? "en" : "ru";
  } catch {
    state.language = "ru";
  }
  langSelect.value = state.language;
}

async function loadCollapsed() {
  try {
    const res = await chrome.storage.local.get("rm_panel_collapsed");
    state.collapsed = res.rm_panel_collapsed === true;
  } catch {
    state.collapsed = false;
  }
  updateCollapseControls();
}

function updateCollapseControls() {
  appShell.classList.toggle("collapsed", state.collapsed);
  panelToggle.setAttribute("aria-expanded", String(!state.collapsed));
  toggleArrow.textContent = state.collapsed ? "→" : "←";
  const label = t(state.collapsed ? "expand_panel" : "collapse_panel");
  panelToggle.setAttribute("aria-label", label);
  panelToggle.setAttribute("title", label);
}

async function setCollapsed(value) {
  state.collapsed = value;
  updateCollapseControls();
  try {
    await chrome.storage.local.set({ rm_panel_collapsed: value });
  } catch (err) {
    console.error(err);
  }
}

async function setLanguage(value) {
  state.language = value === "en" ? "en" : "ru";
  langSelect.value = state.language;
  try {
    await chrome.storage.local.set({ rm_language: state.language });
  } catch (err) {
    console.error(err);
  }
  applyI18n();
}

function renderNetStatus() {
  const ready = Boolean(state.netStatus.attached);
  stripStatus.className = `strip-status ${ready ? "ok" : state.netStatus.error ? "err" : ""}`;
  stripCount.textContent = String(activeRuleCount());

  let text;
  if (!state.netMode) text = t("status_off");
  else if (!state.currentTabId) text = t("status_no_tab");
  else if (state.netStatus.error) text = t("status_error_detail", { error: truncate(state.netStatus.error, 120) });
  else if (ready) text = t("status_attached", { tabId: state.netStatus.tabId == null ? state.currentTabId : state.netStatus.tabId });
  else text = t("status_checking");

  netStatusEl.textContent = text;
}

async function queryNetStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "rm-net-status" });
    if (res && res.tabId != null) {
      state.netStatus = {
        ready: Boolean(res.ready),
        attached: Boolean(res.attached),
        error: res.error || null,
        tabId: res.tabId || null,
        updatedAt: Date.now()
      };
    }
  } catch (err) {
    state.netStatus.error = safeString(err && err.message, "unavailable");
  }
  renderNetStatus();
}

async function fetchInitialLogs() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "rm-get-logs" });
    if (res && Array.isArray(res.logs)) {
      state.logs = normalizeLocalLogs(res.logs);
    }
  } catch (err) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const res = await chrome.tabs.sendMessage(tab.id, { type: "rm-get-logs" });
      if (res && Array.isArray(res.entries)) {
        state.logs = normalizeLocalLogs(res.entries);
      }
    } catch {}
  }
  renderRequests();
}

async function refreshTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.currentTabId = tab ? tab.id : null;
  } catch {
    state.currentTabId = null;
  }
  await fetchInitialLogs();
  renderNetStatus();
  queryNetStatus();
}

async function clearLogs() {
  try {
    await chrome.runtime.sendMessage({ type: "rm-clear-logs" });
  } catch {}
  state.logs = [];
  renderRequests();
}

function syncMethodSelect() {
  const current = methodSelect.value;
  methodSelect.textContent = "";
  const options = ["", ...HTTP_METHODS];
  for (const m of options) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m || t("any_method");
    methodSelect.appendChild(opt);
  }
  methodSelect.value = current;
}

function openModal(entry) {
  state.editingId = null;
  modalTitle.textContent = t("modal_title_new");
  urlInput.value = entry ? safeString(entry.url, "") : "";
  document.querySelector('input[name="match-type"][value="substring"]').checked = true;
  syncMethodSelect();
  methodSelect.value = entry && entry.method ? entry.method : "";
  statusInput.value = entry && entry.status ? entry.status : 200;
  statusTextInput.value = "";
  contentTypeInput.value = "";
  bodyInput.value = "";
  delayInput.value = "";
  enabledInput.checked = true;
  fieldError.textContent = "";
  state.lastFocused = document.activeElement;
  modal.showModal();
  urlInput.focus();
}

function editRule(rule) {
  state.editingId = rule.id;
  modalTitle.textContent = t("modal_title_edit");
  urlInput.value = rule.urlPattern || "";
  const matchRadio = document.querySelector(`input[name="match-type"][value="${rule.matchType === "regex" ? "regex" : "substring"}"]`);
  if (matchRadio) matchRadio.checked = true;
  syncMethodSelect();
  methodSelect.value = rule.method || "";
  statusInput.value = rule.status || 200;
  statusTextInput.value = rule.statusText || "";
  contentTypeInput.value = rule.contentType || "";
  bodyInput.value = rule.body || "";
  delayInput.value = rule.delayMs || "";
  enabledInput.checked = rule.enabled !== false;
  fieldError.textContent = "";
  state.lastFocused = document.activeElement;
  modal.showModal();
  urlInput.focus();
}

function closeModal() {
  modal.close();
  fieldError.textContent = "";
  if (state.lastFocused && document.contains(state.lastFocused)) {
    state.lastFocused.focus();
  }
  state.lastFocused = null;
}

function showFieldError(message) {
  fieldError.textContent = message;
}

async function saveRuleFromForm() {
  const matchType = document.querySelector('input[name="match-type"]:checked').value;
  const delayMs = delayInput.value === "" ? 0 : Number(delayInput.value);
  const rule = {
    id: state.editingId || crypto.randomUUID(),
    urlPattern: urlInput.value.trim(),
    matchType,
    method: methodSelect.value,
    status: Number(statusInput.value),
    statusText: statusTextInput.value.trim(),
    contentType: contentTypeInput.value.trim(),
    body: bodyInput.value,
    delayMs,
    enabled: enabledInput.checked
  };

  if (!rule.urlPattern) return showFieldError(t("error_url_required"));
  if (!Number.isInteger(rule.status) || rule.status < 100 || rule.status > 599) return showFieldError(t("error_status_required"));
  if (matchType === "regex") {
    try {
      new RegExp(rule.urlPattern);
    } catch {
      return showFieldError(t("error_regex"));
    }
  }
  if (byteLength(rule.body) > MAX_BODY_BYTES) return showFieldError(t("error_body"));
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > MAX_DELAY_MS) return showFieldError(t("error_delay"));

  const next = state.rules.filter((r) => r.id !== rule.id);
  if (!state.editingId && next.length >= MAX_RULES) return showFieldError(t("error_rules_limit"));
  next.push(normalizeLocalRule(rule));

  try {
    await chrome.storage.local.set({ rm_rules: next });
    state.rules = next;
    renderRules();
    closeModal();
  } catch (err) {
    showFieldError(t("error_storage"));
    console.error(err);
  }
}

function getFocusable(container) {
  return Array.from(container.querySelectorAll("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

function trapModalFocus(event) {
  if (event.key !== "Tab") return;
  const focusable = getFocusable(modal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function switchTab(which) {
  const requestsActive = which === "requests";
  panelRequests.classList.toggle("hidden", !requestsActive);
  panelRules.classList.toggle("hidden", requestsActive);
  tabRequests.setAttribute("aria-selected", String(requestsActive));
  tabRules.setAttribute("aria-selected", String(!requestsActive));
  tabRequests.tabIndex = requestsActive ? 0 : -1;
  tabRules.tabIndex = requestsActive ? -1 : 0;
}

function onTabKey(event) {
  if (event.key === "ArrowRight") {
    switchTab("requests");
    tabRequests.focus();
  } else if (event.key === "ArrowLeft") {
    switchTab("rules");
    tabRules.focus();
  }
}

netModeCheckbox.addEventListener("change", async () => {
  state.netMode = netModeCheckbox.checked;
  try {
    await chrome.storage.local.set({ rm_net_mode: state.netMode });
  } catch (err) {
    showStorageError();
    console.error(err);
  }
  queryNetStatus();
});

maskUrlsCheckbox.addEventListener("change", async () => {
  state.maskUrls = maskUrlsCheckbox.checked;
  try {
    await chrome.storage.local.set({ rm_mask_urls: state.maskUrls });
  } catch (err) {
    showStorageError();
    console.error(err);
  }
});

langSelect.addEventListener("change", () => setLanguage(langSelect.value));
panelToggle.addEventListener("click", () => setCollapsed(!state.collapsed));
btnRefresh.addEventListener("click", refreshTab);
btnDiag.addEventListener("click", async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: "rm-diag" });
    if (res) alert(JSON.stringify(res, null, 2));
  } catch (err) {
    alert(String(err));
  }
});
btnClear.addEventListener("click", clearLogs);
btnAddRule.addEventListener("click", () => openModal(null));
tabRequests.addEventListener("click", () => switchTab("requests"));
tabRules.addEventListener("click", () => switchTab("rules"));
tabRequests.addEventListener("keydown", onTabKey);
tabRules.addEventListener("keydown", onTabKey);
modalClose.addEventListener("click", closeModal);
btnCancel.addEventListener("click", closeModal);
btnSaveRule.addEventListener("click", saveRuleFromForm);
modal.addEventListener("keydown", trapModalFocus);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.rm_rules) {
    state.rules = normalizeLocalRules(changes.rm_rules.newValue || []);
    renderRules();
  }
  if (changes.rm_net_mode) {
    state.netMode = changes.rm_net_mode.newValue !== false;
    netModeCheckbox.checked = state.netMode;
    renderNetStatus();
  }
  if (changes.rm_mask_urls) {
    state.maskUrls = changes.rm_mask_urls.newValue === true;
    maskUrlsCheckbox.checked = state.maskUrls;
  }
  if (changes.rm_language && changes.rm_language.newValue !== state.language) {
    state.language = changes.rm_language.newValue === "en" ? "en" : "ru";
    langSelect.value = state.language;
    applyI18n();
  }
  if (changes.rm_panel_collapsed && changes.rm_panel_collapsed.newValue !== state.collapsed) {
    state.collapsed = changes.rm_panel_collapsed.newValue === true;
    updateCollapseControls();
  }
});

(async function init() {
  await loadSettings();
  await refreshTab();
  setTimeout(() => refreshTab(), 800);
})();
