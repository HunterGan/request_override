(() => {
  "use strict";

  const Shared = globalThis.RequestOverrideShared;
  const { LIMITS, HTTP_METHODS } = Shared;
  const I18N = {
    ru: {
      overrides: "Подмены", requests: "Запросы", rules: "Правила", retry: "Повторить",
      status_active: "Сетевой перехват активен", status_active_detail: "Mock-статусы видны в DevTools Network",
      status_idle: "Ожидание правила", status_idle_detail: "Debugger подключится только к применимым вкладкам",
      status_starting: "Подключение…", status_starting_detail: "Подготавливаем сетевой перехват",
      status_fallback: "Режим внутри страницы", status_fallback_detail: "Mock работает, но не отображается в DevTools Network",
      status_conflict: "Конфликт debugger", status_conflict_detail: "DevTools или другое расширение заняло подключение",
      status_paused: "Подмены выключены", status_paused_detail: "Все запросы проходят без изменений",
      status_unavailable: "Нет HTTP-вкладки", status_unavailable_detail: "Откройте обычную web-страницу",
      search: "Фильтр URL…", pause: "Приостановить запись", clear: "Очистить запросы",
      mocked_only: "Только MOCKED", recording_paused: "Запись приостановлена", resume: "Продолжить",
      empty_requests_title: "Ждём запросы", empty_requests_body: "Взаимодействуйте со страницей — fetch и XHR появятся здесь в реальном времени.",
      add_rule: "Добавить правило", import_rules: "Импорт правил", export_rules: "Экспорт правил",
      empty_rules_title: "Правил пока нет", empty_rules_body: "Создайте быстрый override из запроса или настройте правило вручную.", create_first: "Создать первое правило",
      network_mode: "Статусы в DevTools", network_mode_detail: "Настоящий HTTP-статус в Network",
      mask_query: "Скрывать параметры URL", mask_query_help: "Заменяет значения после ? в журнале на *** — например token=***", diagnostics: "Диагностика",
      quick_override: "Быстрая подмена", custom_rule: "Настроить вручную…", override_rule: "Правило подмены", new_rule: "Новое правило", edit_rule: "Изменить правило",
      rule_name: "Название", url_match: "Совпадение URL", method: "Метод", status: "Статус", scope: "Область",
      status_text: "Текст статуса", response_body: "Тело ответа", format_json: "Форматировать JSON", delay: "Задержка (мс)", priority: "Приоритет", enabled: "Включено",
      cancel: "Отмена", save_rule: "Сохранить правило", replace: "Заменить", merge: "Объединить",
      any_method: "Любой", current_site: "Текущий сайт", this_tab: "Эта вкладка", all_sites: "Все сайты",
      matches: "Совпадений: {count}", conflict: "Возможный конфликт с правилом «{name}». Победит больший приоритет.",
      required_url: "Укажите URL-паттерн", invalid_status: "Статус должен быть целым числом от 200 до 599", invalid_regex: "Некорректное регулярное выражение",
      invalid_delay: "Задержка должна быть от 0 до 60000 мс", body_too_large: "Тело ответа больше 1 МБ", rule_limit: "Достигнут лимит 100 правил", storage_error: "Не удалось сохранить изменения",
      created: "Правило создано. Повторите запрос.", saved: "Правило сохранено", deleted: "Правило удалено", undo: "Вернуть", duplicated: "Правило продублировано",
      copied: "URL скопирован", diag_copied: "Диагностика скопирована", export_empty: "Нет правил для экспорта", imported: "Правила импортированы",
      import_summary: "Найдено правил: {count}. Совпадающих ID: {conflicts}.", import_conflicts: "При объединении правила с одинаковыми ID будут заменены.", invalid_import: "Файл не содержит корректных правил",
      hits: "срабатываний: {count}", never: "ещё не срабатывало", last_hit: "последнее: {time}",
      site_scope: "сайт", tab_scope: "вкладка", all_scope: "везде", delay_short: "+{delay} мс", selected_export: "Экспортировано правил: {count}",
      show_repeats: "показать {count}", hide_repeats: "скрыть повторы", mode_network: "Network", mode_page: "In-page", mode_native: "Native"
    },
    en: {
      overrides: "Overrides", requests: "Requests", rules: "Rules", retry: "Retry",
      status_active: "Network interception active", status_active_detail: "Mock statuses are visible in DevTools Network",
      status_idle: "Waiting for a rule", status_idle_detail: "Debugger attaches only to applicable tabs",
      status_starting: "Connecting…", status_starting_detail: "Preparing network interception",
      status_fallback: "In-page fallback", status_fallback_detail: "Mock works, but is not visible in DevTools Network",
      status_conflict: "Debugger conflict", status_conflict_detail: "DevTools or another extension owns the connection",
      status_paused: "Overrides disabled", status_paused_detail: "All requests pass through unchanged",
      status_unavailable: "No HTTP tab", status_unavailable_detail: "Open a regular web page",
      search: "Filter URL…", pause: "Pause recording", clear: "Clear requests",
      mocked_only: "MOCKED only", recording_paused: "Recording paused", resume: "Resume",
      empty_requests_title: "Waiting for requests", empty_requests_body: "Interact with the page. Fetch and XHR requests will appear here live.",
      add_rule: "Add rule", import_rules: "Import rules", export_rules: "Export rules",
      empty_rules_title: "No override rules", empty_rules_body: "Use Quick override on a request or create a custom rule.", create_first: "Create first rule",
      network_mode: "DevTools statuses", network_mode_detail: "Real HTTP status in the Network panel",
      mask_query: "Hide URL parameters", mask_query_help: "Replaces values after ? in the journal with *** — for example token=***", diagnostics: "Diagnostics",
      quick_override: "Quick override", custom_rule: "Custom rule…", override_rule: "Override rule", new_rule: "New rule", edit_rule: "Edit rule",
      rule_name: "Name", url_match: "URL match", method: "Method", status: "Status", scope: "Scope",
      status_text: "Status text", response_body: "Response body", format_json: "Format JSON", delay: "Delay (ms)", priority: "Priority", enabled: "Enabled",
      cancel: "Cancel", save_rule: "Save rule", replace: "Replace", merge: "Merge",
      any_method: "Any", current_site: "Current site", this_tab: "This tab", all_sites: "All sites",
      matches: "Matches: {count}", conflict: "Possible conflict with “{name}”. Higher priority wins.",
      required_url: "Enter a URL pattern", invalid_status: "Status must be an integer from 200 to 599", invalid_regex: "Invalid regular expression",
      invalid_delay: "Delay must be between 0 and 60000 ms", body_too_large: "Response body is larger than 1 MB", rule_limit: "Maximum 100 rules reached", storage_error: "Failed to save changes",
      created: "Rule created. Repeat the request.", saved: "Rule saved", deleted: "Rule deleted", undo: "Undo", duplicated: "Rule duplicated",
      copied: "URL copied", diag_copied: "Diagnostics copied", export_empty: "No rules to export", imported: "Rules imported",
      import_summary: "Found {count} rules. Matching IDs: {conflicts}.", import_conflicts: "On merge, rules with matching IDs will be replaced.", invalid_import: "The file has no valid rules",
      hits: "hits: {count}", never: "never matched", last_hit: "last: {time}",
      site_scope: "site", tab_scope: "tab", all_scope: "everywhere", delay_short: "+{delay} ms", selected_export: "Exported rules: {count}",
      show_repeats: "show {count}", hide_repeats: "hide repeats", mode_network: "Network", mode_page: "In-page", mode_native: "Native"
    }
  };

  const state = {
    language: "ru", rules: [], logs: [], currentTabId: null, currentPageUrl: "", currentOrigin: "",
    overridesEnabled: true, netMode: true, maskUrls: false, recordingPaused: false,
    netStatus: { status: "starting", error: null, applicableRuleCount: 0 }, activePanel: "requests",
    requestFilter: { search: "", method: "", status: "", mockedOnly: false }, expandedGroups: new Set(),
    selectedRules: new Set(), ruleStats: {}, editingId: null, sourceEntry: null, patternMode: "path",
    quickEntry: null, pendingImport: null, undoRule: null, pendingCaptures: [], renderScheduled: false, toastTimer: null
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    app: $("app"), main: $("main"), pageLabel: $("page-label"),
    master: $("master-toggle"), statusCard: $("status-card"), statusTitle: $("status-title"), statusDetail: $("status-detail"), retry: $("retry-btn"),
    tabRequests: $("tab-requests"), tabRules: $("tab-rules"), requestCount: $("request-count"), ruleCount: $("rule-count"),
    requestsPanel: $("requests-panel"), rulesPanel: $("rules-panel"), search: $("request-search"), methodFilter: $("method-filter"), statusFilter: $("status-filter"), mockedFilter: $("mocked-filter"),
    pause: $("pause-btn"), resume: $("resume-btn"), clear: $("clear-btn"), recordingBanner: $("recording-banner"), requestList: $("request-list"), requestsEmpty: $("requests-empty"),
    addRule: $("add-rule-btn"), emptyAdd: $("empty-add-btn"), importButton: $("import-btn"), exportButton: $("export-btn"), importFile: $("import-file"), rulesList: $("rules-list"), rulesEmpty: $("rules-empty"),
    network: $("network-toggle"), mask: $("mask-toggle"), language: $("language-select"), diagnostics: $("diagnostics-btn"),
    quickMenu: $("quick-menu"), quickClose: $("quick-close"), quickTarget: $("quick-target"), customRule: $("custom-rule-btn"),
    ruleDialog: $("rule-dialog"), ruleDialogTitle: $("rule-dialog-title"), ruleClose: $("rule-close"), ruleName: $("rule-name"), ruleUrl: $("rule-url"), matchCount: $("match-count"), conflict: $("conflict-warning"),
    ruleMethod: $("rule-method"), ruleStatus: $("rule-status"), ruleScope: $("rule-scope"), ruleStatusText: $("rule-status-text"), ruleContentType: $("rule-content-type"), ruleBody: $("rule-body"),
    ruleDelay: $("rule-delay"), rulePriority: $("rule-priority"), ruleEnabled: $("rule-enabled"), formatJson: $("format-json-btn"), formError: $("form-error"), saveRule: $("save-rule-btn"), patternMode: $("pattern-mode"),
    importDialog: $("import-dialog"), importSummary: $("import-summary"), importConflicts: $("import-conflicts"), importCancel: $("import-cancel"), importReplace: $("import-replace"), importMerge: $("import-merge"),
    toast: $("toast"), toastText: $("toast-text"), toastAction: $("toast-action")
  };

  function t(key, parameters) {
    let value = (I18N[state.language] && I18N[state.language][key]) || I18N.en[key] || key;
    for (const [name, replacement] of Object.entries(parameters || {})) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function applyI18n() {
    document.documentElement.lang = state.language;
    document.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
      const label = t(element.dataset.i18nTitle);
      element.title = label;
      element.setAttribute("aria-label", label);
    });
    syncRuleSelects();
    renderAll();
  }

  function syncRuleSelects() {
    const method = els.ruleMethod.value;
    els.ruleMethod.textContent = "";
    for (const item of HTTP_METHODS) {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = item || t("any_method");
      els.ruleMethod.appendChild(option);
    }
    els.ruleMethod.value = method;
    els.ruleScope.options[0].textContent = t("current_site");
    els.ruleScope.options[1].textContent = t("this_tab");
    els.ruleScope.options[2].textContent = t("all_sites");
  }

  function getUrlParts(url) {
    try {
      const parsed = new URL(url);
      return { host: parsed.host, path: `${parsed.pathname}${parsed.search}`, cleanPath: parsed.pathname || "/" };
    } catch (_error) {
      return { host: "", path: String(url), cleanPath: String(url).split("?")[0] };
    }
  }

  function statusClass(status) {
    const family = Math.floor(Number(status) / 100);
    return Number(status) === 0 ? "s0" : `s${family}`;
  }

  function modeLabel(mode) {
    if (mode === "network") return t("mode_network");
    if (mode === "in-page") return t("mode_page");
    return t("mode_native");
  }

  function renderStatus() {
    const status = state.netStatus.status || "unavailable";
    els.statusCard.className = `status-card ${status}`;
    els.statusTitle.textContent = t(`status_${status}`);
    els.statusDetail.textContent = state.netStatus.error || t(`status_${status}_detail`);
    els.retry.classList.toggle("hidden", !["conflict", "fallback"].includes(status));
    els.master.checked = state.overridesEnabled;
  }

  function filteredLogs() {
    const search = state.requestFilter.search.toLowerCase();
    return state.logs.filter((entry) => {
      if (search && !entry.url.toLowerCase().includes(search)) return false;
      if (state.requestFilter.method && entry.method !== state.requestFilter.method) return false;
      if (state.requestFilter.status === "0" && entry.status !== 0) return false;
      if (state.requestFilter.status && state.requestFilter.status !== "0" && Math.floor(entry.status / 100) !== Number(state.requestFilter.status)) return false;
      if (state.requestFilter.mockedOnly && !entry.mocked) return false;
      return true;
    });
  }

  function groupLogs(logs) {
    const groups = new Map();
    for (const entry of logs.slice().reverse()) {
      const key = `${entry.method} ${Shared.smartPattern(entry.url)}`;
      if (!groups.has(key)) groups.set(key, { key, latest: entry, entries: [] });
      groups.get(key).entries.push(entry);
    }
    return Array.from(groups.values());
  }

  function captureMatchesEntry(entry, capture) {
    return entry.method === capture.method &&
      Shared.smartPattern(entry.url) === Shared.smartPattern(capture.url) &&
      Math.abs(entry.ts - capture.ts) < 300000;
  }

  function applyCapture(entry, capture) {
    entry.responseCaptured = capture.responseCaptured === true;
    entry.responseBody = capture.responseBody || "";
    entry.responseContentType = capture.responseContentType || "";
    entry.responseBodyTruncated = capture.responseBodyTruncated === true;
    if (capture.mocked) {
      entry.mocked = true;
      entry.mode = capture.mode;
      entry.ruleId = capture.ruleId;
    }
  }

  function enrichEntryFromPendingCapture(entry) {
    const index = state.pendingCaptures.findIndex((capture) => captureMatchesEntry(entry, capture));
    if (index < 0) return;
    const [capture] = state.pendingCaptures.splice(index, 1);
    applyCapture(entry, capture);
  }

  function receiveCapture(rawCapture) {
    const capture = Shared.normalizeLog(rawCapture);
    if (!capture) return;
    const entry = state.logs.slice().reverse().find((candidate) => !candidate.responseCaptured && captureMatchesEntry(candidate, capture));
    if (entry) applyCapture(entry, capture);
    else state.pendingCaptures.push(capture);
    if (state.pendingCaptures.length > 50) state.pendingCaptures.splice(0, state.pendingCaptures.length - 50);
    scheduleRequestsRender();
  }

  function scheduleRequestsRender() {
    if (state.renderScheduled) return;
    state.renderScheduled = true;
    requestAnimationFrame(() => {
      state.renderScheduled = false;
      renderRequests();
    });
  }

  function renderRequests() {
    const logs = filteredLogs();
    const groups = groupLogs(logs);
    els.requestCount.textContent = String(state.logs.length);
    els.requestsEmpty.classList.toggle("hidden", groups.length > 0);
    els.requestList.classList.toggle("hidden", groups.length === 0);
    els.requestList.textContent = "";

    for (const group of groups) {
      const entry = group.latest;
      const parts = getUrlParts(entry.url);
      const matchedRule = entry.ruleId ? state.rules.find((rule) => rule.id === entry.ruleId) : null;
      const expanded = state.expandedGroups.has(group.key);
      const card = document.createElement("article");
      card.className = "request-group";
      card.innerHTML = `
        <div class="request-row" tabindex="0" role="button" aria-label="${escapeHtml(`${entry.method} ${parts.path} ${entry.status}`)}">
          <span class="method ${escapeHtml(entry.method.toLowerCase())}">${escapeHtml(entry.method)}</span>
          <span class="request-copy"><span class="request-path">${escapeHtml(parts.path)}</span><span class="request-host">${escapeHtml(parts.host)}</span></span>
          <span class="status ${statusClass(entry.status)}">${entry.status || "ERR"}</span>
          <button class="quick-button" type="button" aria-label="${escapeHtml(t("quick_override"))}">＋</button>
        </div>
        <div class="request-meta">
          <span>${entry.durationMs} ms</span>
          ${entry.mocked ? `<span class="badge mocked">MOCKED</span>` : ""}
          <span class="badge ${entry.mode === "network" ? "network" : ""}">${escapeHtml(modeLabel(entry.mode))}</span>
          ${matchedRule ? `<span class="badge" title="${escapeHtml(ruleDisplayName(matchedRule))}">${escapeHtml(ruleDisplayName(matchedRule))}</span>` : ""}
          <button class="group-toggle" type="button">${group.entries.length > 1 ? escapeHtml(expanded ? t("hide_repeats") : t("show_repeats", { count: group.entries.length })) : ""}</button>
          <button class="group-toggle copy-url" type="button" title="Copy URL">⧉</button>
          ${group.entries.length > 1 ? `<span class="count-badge">×${group.entries.length}</span>` : ""}
        </div>
        <div class="request-children ${expanded ? "" : "hidden"}"></div>`;
      const row = card.querySelector(".request-row");
      const quick = card.querySelector(".quick-button");
      const groupToggle = card.querySelector(".group-toggle");
      const copy = card.querySelector(".copy-url");
      const children = card.querySelector(".request-children");
      row.addEventListener("click", (event) => { if (!event.target.closest("button")) openRuleDialog({ entry }); });
      row.addEventListener("keydown", (event) => { if (event.key === "Enter") openRuleDialog({ entry }); });
      row.addEventListener("contextmenu", (event) => { event.preventDefault(); openQuickMenu(entry, { x: event.clientX, y: event.clientY }); });
      quick.addEventListener("click", (event) => { event.stopPropagation(); const rect = quick.getBoundingClientRect(); openQuickMenu(entry, { x: rect.right, y: rect.bottom }); });
      copy.addEventListener("click", async () => { await copyText(entry.url); showToast(t("copied")); });
      if (group.entries.length > 1) {
        groupToggle.addEventListener("click", () => {
          if (expanded) state.expandedGroups.delete(group.key); else state.expandedGroups.add(group.key);
          renderRequests();
        });
        for (const child of group.entries.slice(1)) {
          const line = document.createElement("div");
          line.className = "request-child";
          line.innerHTML = `<span class="status ${statusClass(child.status)}">${child.status || "ERR"}</span><span>${child.durationMs} ms</span><span>${escapeHtml(modeLabel(child.mode))}</span><time>${new Date(child.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>`;
          children.appendChild(line);
        }
      }
      els.requestList.appendChild(card);
    }
  }

  function sortedRules() {
    return state.rules.slice().sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  }

  function ruleDisplayName(rule) {
    return rule.name || `${rule.method || "ANY"} ${getUrlParts(rule.urlPattern).cleanPath || rule.urlPattern}`;
  }

  function ruleConflict(rule) {
    return state.rules.find((candidate) => candidate.id !== rule.id && Shared.rulesMayConflict(rule, candidate)) || null;
  }

  function scopeLabel(rule) {
    if (rule.scopeType === "site") {
      let host = rule.scopeValue;
      try { host = new URL(rule.scopeValue).host; } catch (_error) { /* keep raw scope */ }
      return `${t("site_scope")}: ${host}`;
    }
    if (rule.scopeType === "tab") return `${t("tab_scope")}: ${rule.scopeValue}`;
    return t("all_scope");
  }

  function renderRules() {
    const rules = sortedRules();
    els.ruleCount.textContent = String(state.rules.filter((rule) => rule.enabled).length);
    els.rulesEmpty.classList.toggle("hidden", rules.length > 0);
    els.rulesList.classList.toggle("hidden", rules.length === 0);
    els.rulesList.textContent = "";
    for (const rule of rules) {
      const stats = state.ruleStats[rule.id] || { count: 0, lastMatchedAt: null };
      const conflict = ruleConflict(rule);
      const card = document.createElement("article");
      card.className = `rule-card ${rule.enabled ? "" : "disabled"} ${conflict ? "conflicting" : ""}`;
      card.innerHTML = `
        <input class="rule-select" type="checkbox" aria-label="Select" ${state.selectedRules.has(rule.id) ? "checked" : ""} />
        <div class="rule-main">
          <div class="rule-head"><h3 class="rule-name">${escapeHtml(ruleDisplayName(rule))}</h3><span class="rule-status status ${statusClass(rule.status)}">${rule.status}</span><button class="rule-toggle ${rule.enabled ? "on" : ""}" type="button" aria-label="Toggle"></button></div>
          <code class="rule-pattern" title="${escapeHtml(rule.urlPattern)}">${escapeHtml(rule.urlPattern)}</code>
          <div class="rule-details"><span class="detail-pill">${escapeHtml(rule.method || "ANY")}</span><span class="detail-pill">${escapeHtml(scopeLabel(rule))}</span><span class="detail-pill">P${rule.priority}</span>${rule.delayMs ? `<span class="detail-pill">${escapeHtml(t("delay_short", { delay: rule.delayMs }))}</span>` : ""}<span class="detail-pill">${escapeHtml(stats.count ? t("hits", { count: stats.count }) : t("never"))}</span>${stats.lastMatchedAt ? `<span class="detail-pill">${escapeHtml(t("last_hit", { time: new Date(stats.lastMatchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }))}</span>` : ""}</div>
          <div class="rule-actions"><button data-action="up" title="Priority up">↑</button><button data-action="down" title="Priority down">↓</button><button data-action="edit" title="Edit">✎</button><button data-action="duplicate" title="Duplicate">⧉</button><button data-action="delete" class="danger" title="Delete">×</button></div>
        </div>`;
      card.querySelector(".rule-select").addEventListener("change", (event) => { if (event.target.checked) state.selectedRules.add(rule.id); else state.selectedRules.delete(rule.id); });
      card.querySelector(".rule-toggle").addEventListener("click", () => updateRule(rule.id, { enabled: !rule.enabled }));
      card.querySelector("[data-action='up']").addEventListener("click", () => moveRule(rule.id, -1));
      card.querySelector("[data-action='down']").addEventListener("click", () => moveRule(rule.id, 1));
      card.querySelector("[data-action='edit']").addEventListener("click", () => openRuleDialog({ rule }));
      card.querySelector("[data-action='duplicate']").addEventListener("click", () => duplicateRule(rule));
      card.querySelector("[data-action='delete']").addEventListener("click", () => deleteRule(rule));
      els.rulesList.appendChild(card);
    }
  }

  function renderAll() {
    renderStatus();
    renderRequests();
    renderRules();
    els.recordingBanner.classList.toggle("hidden", !state.recordingPaused);
    els.pause.classList.toggle("active", state.recordingPaused);
    els.mockedFilter.setAttribute("aria-pressed", String(state.requestFilter.mockedOnly));
  }

  function switchPanel(panel) {
    state.activePanel = panel;
    const requests = panel === "requests";
    els.requestsPanel.classList.toggle("hidden", !requests);
    els.rulesPanel.classList.toggle("hidden", requests);
    els.tabRequests.classList.toggle("active", requests);
    els.tabRules.classList.toggle("active", !requests);
    els.tabRequests.setAttribute("aria-selected", String(requests));
    els.tabRules.setAttribute("aria-selected", String(!requests));
  }

  function openQuickMenu(entry, point) {
    state.quickEntry = entry;
    const parts = getUrlParts(entry.url);
    els.quickTarget.textContent = `${entry.method} ${parts.cleanPath}`;
    els.quickMenu.classList.remove("hidden");
    const rect = els.quickMenu.getBoundingClientRect();
    const left = Math.max(8, Math.min(point.x - rect.width, innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(point.y + 4, innerHeight - rect.height - 8));
    els.quickMenu.style.left = `${left}px`;
    els.quickMenu.style.top = `${top}px`;
  }

  function closeQuickMenu() {
    els.quickMenu.classList.add("hidden");
    state.quickEntry = null;
  }

  function nextPriority() {
    return state.rules.reduce((maximum, rule) => Math.max(maximum, rule.priority), 0) + 10;
  }

  function responseBodyForStatus(status) {
    if (status === 200 || Shared.NULL_BODY_STATUSES.has(status)) return "";
    return JSON.stringify({ error: Shared.defaultStatusText(status) || "Request failed", status }, null, 2);
  }

  async function applyPreset(preset) {
    const entry = state.quickEntry;
    if (!entry) return;
    const slow = preset === "slow";
    const status = slow ? 200 : Number(preset);
    const path = getUrlParts(entry.url).cleanPath;
    const rule = Shared.normalizeRule({
      id: Shared.createId("rule"), name: `${entry.method} ${path} — ${slow ? "slow 2s" : status}`,
      urlPattern: Shared.smartPattern(entry.url), matchType: "substring", method: entry.method,
      status, statusText: Shared.defaultStatusText(status), contentType: status === 200 ? "" : "application/json; charset=utf-8",
      body: responseBodyForStatus(status), delayMs: slow ? 2000 : 0, enabled: true,
      scopeType: state.currentOrigin ? "site" : "all", scopeValue: state.currentOrigin, priority: nextPriority()
    });
    closeQuickMenu();
    if (state.rules.length >= LIMITS.maxRules) return showToast(t("rule_limit"));
    await saveRules([...state.rules, rule]);
    showToast(t("created"));
    switchPanel("rules");
  }

  function setPatternMode(mode) {
    state.patternMode = mode;
    els.patternMode.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.patternMode === mode));
    if (state.sourceEntry) {
      if (mode === "exact") els.ruleUrl.value = Shared.exactPattern(state.sourceEntry.url);
      else if (mode === "regex") els.ruleUrl.value = Shared.regexPattern(state.sourceEntry.url);
      else els.ruleUrl.value = Shared.smartPattern(state.sourceEntry.url);
    }
    updateRulePreview();
  }

  function draftRule() {
    const scopeType = els.ruleScope.value;
    const existing = state.rules.find((rule) => rule.id === state.editingId);
    let scopeValue = "";
    if (scopeType === "site") scopeValue = existing && existing.scopeType === "site" ? existing.scopeValue : state.currentOrigin;
    if (scopeType === "tab") scopeValue = existing && existing.scopeType === "tab" ? existing.scopeValue : String(state.currentTabId || "");
    return Shared.normalizeRule({
      id: state.editingId || "draft", name: els.ruleName.value.trim(), urlPattern: els.ruleUrl.value.trim(),
      matchType: state.patternMode === "regex" ? "regex" : state.patternMode === "exact" ? "exact" : "substring", method: els.ruleMethod.value,
      status: Number(els.ruleStatus.value), statusText: els.ruleStatusText.value.trim(), contentType: els.ruleContentType.value.trim(),
      body: els.ruleBody.value, delayMs: Number(els.ruleDelay.value), enabled: els.ruleEnabled.checked,
      scopeType, scopeValue,
      priority: Number(els.rulePriority.value)
    });
  }

  function updateRulePreview() {
    const draft = draftRule();
    let count = 0;
    if (draft && draft.urlPattern) {
      for (const entry of state.logs) {
        if (Shared.ruleMatchesRequest(draft, entry.url, entry.method, { tabId: state.currentTabId, pageUrl: state.currentPageUrl })) count += 1;
      }
    }
    els.matchCount.textContent = t("matches", { count });
    const conflict = draft && state.rules.find((rule) => rule.id !== state.editingId && Shared.rulesMayConflict(draft, rule));
    els.conflict.classList.toggle("hidden", !conflict);
    els.conflict.textContent = conflict ? t("conflict", { name: ruleDisplayName(conflict) }) : "";
  }

  function openRuleDialog({ entry = null, rule = null } = {}) {
    closeQuickMenu();
    state.sourceEntry = entry;
    state.editingId = rule && rule.id;
    els.ruleDialogTitle.textContent = t(rule ? "edit_rule" : "new_rule");
    const path = entry ? getUrlParts(entry.url).cleanPath : "";
    els.ruleName.value = rule ? rule.name : entry ? `${entry.method} ${path}` : "";
    els.ruleMethod.value = rule ? rule.method : entry ? entry.method : "";
    els.ruleStatus.value = rule ? rule.status : entry && entry.status >= 200 ? entry.status : 200;
    els.ruleStatusText.value = rule ? rule.statusText : Shared.defaultStatusText(Number(els.ruleStatus.value));
    els.ruleContentType.value = rule ? rule.contentType : entry && entry.responseContentType ? entry.responseContentType : "application/json; charset=utf-8";
    els.ruleBody.value = rule ? rule.body : entry && entry.responseCaptured ? entry.responseBody : "";
    els.ruleDelay.value = rule ? rule.delayMs : 0;
    els.rulePriority.value = rule ? rule.priority : nextPriority();
    els.ruleEnabled.checked = rule ? rule.enabled : true;
    els.ruleScope.value = rule ? rule.scopeType : state.currentOrigin ? "site" : "all";
    els.formError.textContent = "";
    state.patternMode = rule && rule.matchType === "regex" ? "regex" : rule && rule.matchType === "exact" ? "exact" : "path";
    els.ruleUrl.value = rule ? rule.urlPattern : entry ? Shared.smartPattern(entry.url) : "";
    setPatternMode(state.patternMode);
    els.ruleDialog.showModal();
    els.ruleName.focus();
  }

  function validateDraft(rule) {
    if (!els.ruleUrl.value.trim()) return t("required_url");
    const status = Number(els.ruleStatus.value);
    if (!Number.isInteger(status) || status < 200 || status > 599) return t("invalid_status");
    if (state.patternMode === "regex") {
      try { new RegExp(els.ruleUrl.value.trim()); } catch (_error) { return t("invalid_regex"); }
    }
    const delay = Number(els.ruleDelay.value);
    if (!Number.isFinite(delay) || delay < 0 || delay > LIMITS.maxDelayMs) return t("invalid_delay");
    if (Shared.byteLength(els.ruleBody.value) > LIMITS.maxBodyBytes) return t("body_too_large");
    if (!state.editingId && state.rules.length >= LIMITS.maxRules) return t("rule_limit");
    if (!rule) return t("storage_error");
    return "";
  }

  async function submitRule() {
    const existing = state.rules.find((rule) => rule.id === state.editingId);
    const rule = draftRule();
    const error = validateDraft(rule);
    if (error) { els.formError.textContent = error; return; }
    rule.id = existing ? existing.id : Shared.createId("rule");
    rule.createdAt = existing ? existing.createdAt : Date.now();
    rule.updatedAt = Date.now();
    if (Shared.NULL_BODY_STATUSES.has(rule.status)) rule.body = "";
    const next = state.rules.filter((candidate) => candidate.id !== rule.id);
    next.push(rule);
    try {
      await saveRules(next);
      els.ruleDialog.close();
      showToast(t(existing ? "saved" : "created"));
    } catch (_error) {
      els.formError.textContent = t("storage_error");
    }
  }

  async function saveRules(rules) {
    const normalized = Shared.normalizeRules(rules);
    await chrome.storage.local.set({ rm_rules: normalized, rm_schema_version: Shared.SCHEMA_VERSION });
    state.rules = normalized;
    const synced = await chrome.runtime.sendMessage({ type: "rm-sync-tab", tabId: state.currentTabId }).catch(() => null);
    if (synced && synced.status) state.netStatus = { ...state.netStatus, ...synced };
    renderRules();
    renderStatus();
  }

  async function updateRule(id, patch) {
    await saveRules(state.rules.map((rule) => rule.id === id ? Shared.normalizeRule({ ...rule, ...patch, updatedAt: Date.now() }) : rule));
  }

  async function moveRule(id, direction) {
    const ordered = sortedRules();
    const index = ordered.findIndex((rule) => rule.id === id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
    const first = ordered[index];
    const second = ordered[swapIndex];
    const priority = first.priority;
    first.priority = second.priority;
    second.priority = priority;
    if (first.priority === second.priority) {
      first.priority += direction < 0 ? 1 : -1;
    }
    await saveRules(state.rules.map((rule) => ordered.find((candidate) => candidate.id === rule.id) || rule));
  }

  async function duplicateRule(rule) {
    if (state.rules.length >= LIMITS.maxRules) return showToast(t("rule_limit"));
    const copy = Shared.normalizeRule({ ...rule, id: Shared.createId("rule"), name: `${ruleDisplayName(rule)} copy`, priority: nextPriority(), createdAt: Date.now(), updatedAt: Date.now() });
    await saveRules([...state.rules, copy]);
    showToast(t("duplicated"));
  }

  async function deleteRule(rule) {
    state.undoRule = rule;
    await saveRules(state.rules.filter((candidate) => candidate.id !== rule.id));
    showToast(t("deleted"), t("undo"), async () => {
      if (state.undoRule) await saveRules([...state.rules, state.undoRule]);
      state.undoRule = null;
    });
  }

  async function copyText(text) {
    const value = String(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }

  function showToast(message, actionLabel, action) {
    clearTimeout(state.toastTimer);
    els.toastText.textContent = message;
    els.toastAction.classList.toggle("hidden", !actionLabel);
    els.toastAction.textContent = actionLabel || "";
    els.toastAction.onclick = action || null;
    els.toast.classList.remove("hidden");
    state.toastTimer = setTimeout(() => els.toast.classList.add("hidden"), actionLabel ? 5000 : 2600);
  }

  function exportRules() {
    const selected = state.rules.filter((rule) => state.selectedRules.has(rule.id));
    const rules = selected.length ? selected : state.rules;
    if (!rules.length) return showToast(t("export_empty"));
    const blob = new Blob([JSON.stringify({ schemaVersion: Shared.SCHEMA_VERSION, exportedAt: new Date().toISOString(), rules }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `request-override-rules-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t("selected_export", { count: rules.length }));
  }

  async function prepareImport(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const rawRules = Array.isArray(parsed) ? parsed : parsed.rules;
      const imported = Shared.normalizeRules(rawRules);
      if (!imported.length) throw new Error("empty");
      const ids = new Set(state.rules.map((rule) => rule.id));
      const conflicts = imported.filter((rule) => ids.has(rule.id)).length;
      state.pendingImport = imported;
      els.importSummary.textContent = t("import_summary", { count: imported.length, conflicts });
      els.importConflicts.textContent = t("import_conflicts");
      els.importConflicts.classList.toggle("hidden", conflicts === 0);
      els.importDialog.showModal();
    } catch (_error) {
      showToast(t("invalid_import"));
    } finally {
      els.importFile.value = "";
    }
  }

  async function finishImport(replace) {
    if (!state.pendingImport) return;
    let next = state.pendingImport;
    if (!replace) {
      const incomingIds = new Set(next.map((rule) => rule.id));
      next = [...state.rules.filter((rule) => !incomingIds.has(rule.id)), ...next];
    }
    if (next.length > LIMITS.maxRules) next = next.slice(0, LIMITS.maxRules);
    await saveRules(next);
    state.pendingImport = null;
    els.importDialog.close();
    showToast(t("imported"));
  }

  async function refreshContextAndLogs() {
    try {
      const previousTabId = state.currentTabId;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      state.currentTabId = tab && tab.id != null ? tab.id : null;
      if (previousTabId !== state.currentTabId) state.pendingCaptures = [];
      state.currentPageUrl = tab && tab.url ? tab.url : "";
      state.currentOrigin = Shared.normalizeOrigin(state.currentPageUrl);
      els.pageLabel.textContent = state.currentOrigin ? new URL(state.currentOrigin).host : t("status_unavailable");
      const [logsResponse, statusResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: "rm-get-logs", tabId: state.currentTabId }),
        chrome.runtime.sendMessage({ type: "rm-net-status", tabId: state.currentTabId })
      ]);
      state.logs = Array.isArray(logsResponse && logsResponse.entries) ? logsResponse.entries.map(Shared.normalizeLog).filter(Boolean) : [];
      if (statusResponse) state.netStatus = statusResponse;
    } catch (_error) {
      state.netStatus = { status: "unavailable", error: null, applicableRuleCount: 0 };
    }
    renderAll();
  }

  async function loadState() {
    const stored = await chrome.storage.local.get([
      "rm_rules", "rm_overrides_enabled", "rm_net_mode", "rm_mask_urls", "rm_language"
    ]);
    state.rules = Shared.normalizeRules(stored.rm_rules);
    state.overridesEnabled = stored.rm_overrides_enabled !== false;
    state.netMode = stored.rm_net_mode !== false;
    state.maskUrls = stored.rm_mask_urls === true;
    state.language = stored.rm_language === "en" ? "en" : "ru";
    els.network.checked = state.netMode;
    els.mask.checked = state.maskUrls;
    els.language.value = state.language;
    const stats = await chrome.runtime.sendMessage({ type: "rm-rule-stats" }).catch(() => null);
    state.ruleStats = (stats && stats.stats) || {};
    applyI18n();
    await refreshContextAndLogs();
  }

  els.tabRequests.addEventListener("click", () => switchPanel("requests"));
  els.tabRules.addEventListener("click", () => switchPanel("rules"));
  els.search.addEventListener("input", () => { state.requestFilter.search = els.search.value; scheduleRequestsRender(); });
  els.methodFilter.addEventListener("change", () => { state.requestFilter.method = els.methodFilter.value; renderRequests(); });
  els.statusFilter.addEventListener("change", () => { state.requestFilter.status = els.statusFilter.value; renderRequests(); });
  els.mockedFilter.addEventListener("click", () => { state.requestFilter.mockedOnly = !state.requestFilter.mockedOnly; renderAll(); });
  els.pause.addEventListener("click", () => { state.recordingPaused = !state.recordingPaused; renderAll(); });
  els.resume.addEventListener("click", () => { state.recordingPaused = false; renderAll(); });
  els.clear.addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "rm-clear-logs", tabId: state.currentTabId }); state.logs = []; renderRequests(); });
  els.addRule.addEventListener("click", () => openRuleDialog());
  els.emptyAdd.addEventListener("click", () => openRuleDialog());
  els.quickClose.addEventListener("click", closeQuickMenu);
  els.quickMenu.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
  els.customRule.addEventListener("click", () => { const entry = state.quickEntry; closeQuickMenu(); openRuleDialog({ entry }); });
  document.addEventListener("pointerdown", (event) => { if (!els.quickMenu.classList.contains("hidden") && !els.quickMenu.contains(event.target) && !event.target.closest(".quick-button")) closeQuickMenu(); });

  els.patternMode.addEventListener("click", (event) => { const button = event.target.closest("[data-pattern-mode]"); if (button) setPatternMode(button.dataset.patternMode); });
  [els.ruleUrl, els.ruleMethod, els.ruleScope, els.rulePriority, els.ruleEnabled].forEach((element) => element.addEventListener("input", updateRulePreview));
  els.ruleStatus.addEventListener("change", () => { els.ruleStatusText.value = Shared.defaultStatusText(Number(els.ruleStatus.value)); if (Shared.NULL_BODY_STATUSES.has(Number(els.ruleStatus.value))) els.ruleBody.value = ""; });
  els.formatJson.addEventListener("click", () => {
    try { els.ruleBody.value = JSON.stringify(JSON.parse(els.ruleBody.value), null, 2); els.formError.textContent = ""; } catch (_error) { els.formError.textContent = "Invalid JSON"; }
  });
  els.ruleDialog.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter && event.submitter.value === "cancel") els.ruleDialog.close();
    else void submitRule();
  });

  els.master.addEventListener("change", async () => {
    state.overridesEnabled = els.master.checked;
    if (!state.overridesEnabled) state.netStatus = { ...state.netStatus, status: "paused", attached: false };
    renderStatus();
    await chrome.storage.local.set({ rm_overrides_enabled: state.overridesEnabled });
  });
  els.network.addEventListener("change", async () => { state.netMode = els.network.checked; await chrome.storage.local.set({ rm_net_mode: state.netMode }); });
  els.mask.addEventListener("change", async () => { state.maskUrls = els.mask.checked; await chrome.storage.local.set({ rm_mask_urls: state.maskUrls }); await refreshContextAndLogs(); });
  els.language.addEventListener("change", async () => { state.language = els.language.value === "en" ? "en" : "ru"; await chrome.storage.local.set({ rm_language: state.language }); applyI18n(); });
  els.retry.addEventListener("click", async () => { await chrome.storage.local.set({ rm_net_mode: false }); await chrome.storage.local.set({ rm_net_mode: true }); });
  els.diagnostics.addEventListener("click", async () => { const diagnostics = await chrome.runtime.sendMessage({ type: "rm-diag" }); await copyText(JSON.stringify(diagnostics, null, 2)); showToast(t("diag_copied")); });

  els.exportButton.addEventListener("click", exportRules);
  els.importButton.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", () => { if (els.importFile.files[0]) void prepareImport(els.importFile.files[0]); });
  els.importCancel.addEventListener("click", () => { state.pendingImport = null; els.importDialog.close(); });
  els.importReplace.addEventListener("click", () => void finishImport(true));
  els.importMerge.addEventListener("click", () => void finishImport(false));

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "rm-log-live" && message.tabId === state.currentTabId && !state.recordingPaused) {
      const entry = Shared.normalizeLog(message.entry);
      if (entry) {
        enrichEntryFromPendingCapture(entry);
        const existingIndex = state.logs.findIndex((candidate) => candidate.id === entry.id);
        if (existingIndex >= 0) state.logs[existingIndex] = entry;
        else state.logs.push(entry);
        if (state.logs.length > LIMITS.maxLogs) state.logs.splice(0, state.logs.length - LIMITS.maxLogs);
        scheduleRequestsRender();
      }
    } else if (message.type === "rm-log-capture" && message.tabId === state.currentTabId) {
      receiveCapture(message.capture);
    } else if (message.type === "rm-net-status" && message.tabId === state.currentTabId) {
      state.netStatus = message;
      renderStatus();
    } else if (message.type === "rm-rule-hit") {
      state.ruleStats[message.ruleId] = { count: message.count, lastMatchedAt: message.lastMatchedAt };
      renderRules();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.rm_rules) { state.rules = Shared.normalizeRules(changes.rm_rules.newValue); renderRules(); }
    if (changes.rm_overrides_enabled) { state.overridesEnabled = changes.rm_overrides_enabled.newValue !== false; renderStatus(); }
    if (changes.rm_net_mode) { state.netMode = changes.rm_net_mode.newValue !== false; els.network.checked = state.netMode; }
    if (changes.rm_mask_urls) { state.maskUrls = changes.rm_mask_urls.newValue === true; els.mask.checked = state.maskUrls; }
  });

  chrome.tabs.onActivated.addListener(() => void refreshContextAndLogs());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => { if (tabId === state.currentTabId && (changeInfo.url || changeInfo.status === "complete")) void refreshContextAndLogs(); });

  void loadState();
})();
