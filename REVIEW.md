# Критическое ревью: Request Override (formerly Response Mocker, MV3)

> **Статус после выполнения плана исправлений:** основные CRITICAL/MAJOR/минорные проблемы из этого документа исправлены или явно задокументированы как ограничения. Актуальные ограничения см. в `README.md → Limitations`. Автоматические проверки запускаются командой `node validate.js`.

Ревью реализации против TASK.md и здравого смысла. Код не изменён — только дефекты и конкретные фиксы.

## CRITICAL

### C1. `manifest.json:38-42` — невалидные match pattern'ы в `exclude_matches`, расширение может не загрузиться
- Входы `chrome.google.com/*` (строка 40) и `chrome.webstore.com/*` (строка 41) **не содержат схему**. По грамматике match pattern'ов Chrome паттерн обязан содержать как минимум схему и хост — такие записи невалидны. Невалидный паттерн в `content_scripts` → ошибка валидации манифеста → **«Load unpacked» падает, принимка №1 не выполняется вообще**. Под вопросом также `chrome-extension://*/*` (строка 39): схема `chrome-extension` не входит в задокументированный допустимый набор (`http, https, chrome, file, ftp, *`).
- При этом эти защиты бессмысленны: `matches` содержит только `http/https`, так что chrome-страницы и store всё равно никогда не будут инжектиться.
- **Фикс:** удалить строки 38–41 целиком (или заменить на `*://chrome.google.com/*`, `*://chrome.webstore.com/*`). Проверить загрузкой в Chrome; если конкретная версия Chrome вдруг принимает такие паттерны, severity падает до MINOR (записи избыточны).

## MAJOR

### M1. `content-main.js:235-253` — XHR-мок fires события синхронно внутри `send()`
- При `delay=0` `apply()` вызывается синхронно: `readystatechange`/`load`/`loadend` сходятся, **не дожидаясь выхода из `send()`**. Реальный XHR всегда доставляет события последующими task'ами, поэтому код, вешающий `xhr.onload`/`onloadend` **после** `send()` (легально по спецификации, встречается вPromise-обёртках), события не получает → Promise никогда не резолвится → **страница висит**.
- **Фикс:** всегда откладывать: `this.__rmTimer = setTimeout(apply, rule.delay || 0)` (убрать синхронный `apply()` в ветке `else`).

### M2. `content-main.js:240-241` — XHR-мок игнорирует `responseType`
- `response` всегда ставится строкой. Для `responseType="json"` приложение ждёт объект — получает строку (`xhr.response.ok === undefined`, прямой доступ к полям «тела» падает). Для `blob`/`arraybuffer` — неверный тип. По спецификации `responseText` должен быть `""` при `responseType` ≠ `""`/`"text"` — здесь он всегда содержит тело.
- README списывает это на «exotic» типы, но JSON — стандартный кейс API-приложений.
- **Фикс:** в `apply()` читать `this.responseType`: `json` → `JSON.parse(body)` (с try/catch), `blob` → `new Blob([body], { type: contentType })`, `arraybuffer` → `new TextEncoder().encode(body).buffer`, `text`/`""` → строка; для `json`/`blob`/`arraybuffer` ставить `responseText = ""`.

### M3. `content-main.js:265-273` — `abort()` мокнутого XHR с задержкой ломает контракт
- Вызывается только `clearTimeout`: **не fired события `abort`/`loadend`**, не сбрасываются `readyState`/`status`/`response`/`responseText`. Любой Promise, ожидающий `onabort`/`loadend` (например, обёртка с таймаутом, отменяющая XHR), **висит вечно**.
- **Фикс:** в `abort()` при наличии `this.__rmTimer`: clear; поставить флаг `this.__rmAborted = true` и защитить им `apply()`; `defineRm(this, "readyState", 0)`, `status` → 0, `responseText` → `""`, `response` → null; fire `abort` + `loadend`; залогировать запрос со статусом 0.

### M4. `content-main.js:143-159` — fetch-мок игнорирует `Request.signal`
- Берётся только `init.signal`. `fetch(new Request(url, { signal }))` с уже aborted-сигналом должен reject-нуться `AbortError`, а мок резолвится ответом; сигнал, aborted во время задержки, тоже игнорируется.
- **Фикс:** `const signal = (init && init.signal) || (typeof Request !== "undefined" && input instanceof Request ? input.signal : null)` и использовать его в проверки/листенере.

### M5. `content-main.js:121-127, 232-233, 284-290` — в моке нет `Content-Length`
- Ни fetch-`Response`, ни XHR-`getAllResponseHeaders()` не несут `Content-Length` (у реального HTTP-ответа с JSON/текстовым телом он есть). Код, читающий размер из заголовков (прогресс-бары, скачивание), получает `null`. `getAllResponseHeaders()` дополнительно не заканчивается `\r\n`, как у реального Chrome.
- **Фикс:** `const len = new TextEncoder().encode(body).length`; добавить `content-length: String(len)` в headers fetch и в `this.__rmHeaders`; дописать `"\r\n"` в конец `getAllResponseHeaders()`.

### M6. `content-main.js:29, 119-128` + `sidepanel/index.html:77` — status 1xx и 204/205/304 с телом → `TypeError`
- Форма разрешает `min=100`, `normalizeRule` принимает 100–599, но конструктор `new Response(body, { status })` принимает только **200–599**: статус 1xx → `TypeError`; статус 204/205/304 с непустым телом → `TypeError` (по спецификации при этих статусах body обязан быть null). Итог: каждое совпавшее `fetch` возвращает **отклонённый Promise вместо ответа** — хуже, чем отсутствие мока.
- **Фикс:** клампить 200–599 в `normalizeRule` и в форме (`min="200"`); в `buildMockResponse` при `status ∈ {204, 205, 304}` принудительно `body = ""`.

### M7. Acceptance «видно в DevTools Network» не выполнима + неверная инструкция в `README.md:29`
- Моковый ответ — синтетический `Response`/поля XHR в JS; сетевой запрос не делается, **в Network-вкладке его никогда не будет**. Acceptance-пункт (и README: «verify in DevTools → Network») нельзя проверить как написано; пользователю виден только бейдж `MOCKED` в side panel.
- **Фикс:** поправить README/acceptance — проверяйте по бейджу `MOCKED` в side panel, консоли приложения или `console.log(await res.text())`; явно указать в Limitations, что мок не виден в DevTools Network. (Само ТЗ противоречит описанному механизму — это стоит зафиксировать.)

## MINOR

### m1. `content-main.js:227-255` — прочие пробелы в XHR-семантике
- `readyState` прыгает 0/1 → 4 (нет промежуточных `readystatechange` 2/3); событие `timeout` не fired, даже если `xhr.timeout` < delay; нет `progress`-событий; повторный `send()` по мокнутому запросу fire-ит события заново вместо `InvalidStateError`; во время delay `getResponseHeader` уже отвечает (флаг `__rmMocked` ставится на строке 228, до «прихода» ответа).
- **Фикс:** выдать `readystatechange` для 2 и 3 перед 4; эмулировать `timeout` отдельным `setTimeout`, fire-ящим `timeout`+`error`; флаг `this.__rmSent` против повторного `send`; `__rmMocked` выставлять только в `apply()`.

### m2. `content-main.js:119-128` — HEAD и Range
- Для HEAD-запроса мок отдаёт тело, хотя реальный HEAD-ответ не имеет тела (`res.text()` должен дать `""`); Range-запросы игнорируются (всегда 200 + полное тело, никогда 206 + `Content-Range`).
- **Фикс:** при `method === "HEAD"` создавать `Response` с пустым телом (но с `content-length` равным размеру «тела»); в README задокументировать, что Range не эмулируется.

### m3. `content-main.js:123-127` — `response.url` мока пустой
- У реального `fetch` `res.url` равен URL запроса; у мока `""`. Код, читающий `res.url`, получает мусор.
- **Фикс:** после создания ответа `Object.defineProperty(res, "url", { value: url, configurable: true })` или задокументировать.

### m4. `content-main.js:74` + `sidepanel/app.js:289-294` — коллизия id логов между фреймами
- `logSeq` обнуляется в каждом фрейме (у каждого фрейма своя копия MAIN-world), id дублируются; `rowFromEvent` ищет по id через `find` → **правый клик по строке из iframe B может открыть модалку с данными запроса A** (URL подставится чужой).
- **Фикс:** глобально-уникальный id (например `Date.now() + ":" + seq` с учётом frameId) и/или поиск по `id + url`.

### m5. `background.js:64-78` + `sidepanel/app.js:161-169` — «Refresh» показывает логи только одного фрейма
- `chrome.tabs.sendMessage` резолвится первым ответившим фреймом (обычно main frame), тогда как live-поток агрегирует логи всех фреймов → после Refresh список несовместим с live-видом.
- **Фикс:** добавить `frameId` в entry и собирать/мержить по всем фреймам, либо задокументировать ограничение.

### m6. `content-main.js:146-158` — утечка listener'ов на `AbortSignal`
- Listener `"abort"` не снимается после завершения delay: сигнал (особенно переиспользуемый `AbortController`) накапливает замыкания, держащие `rule`/`response`.
- **Фикс:** сохранить обработчик и `signal.removeEventListener("abort", handler)` в ветке resolve.

### m7. `content-main.js:86-92` — канал правил подделывается со страницы
- Любой JS страницы может `window.postMessage({ source: "__RESPONSE_MOCKER__.bridge", type: "rules", ... })` и перезаписать `rules` в своём контексте: ни token, ни проверка отправителя. Влияние ограничено самой страницей (правила действуют только на её запросы), но инвариант «правила из side panel авторитетны» ломается.
- **Фикс:** хотя бы random-токен на инжекцию в payload (ISOLATED/MAIN не делят JS-переменные, токен можно передать через DOM-атрибут; полная защита невозможна — честно задокументировать ограничение).

### m8. `sidepanel/app.js:84` — `&middot;` в `textContent`
- `textContent` не интерпретирует HTML-сущности → в UI буквально печатается `substring &middot; delay 500 ms`.
- **Фикс:** использовать реальный символ `" · "` (или `innerHTML` с `escapeHtml`).

### m9. `sidepanel/app.js:195-197` — метод вне списка select молча сбрасывается в «Any»
- Для методов, отсутствующих в select (CONNECT, TRACE, …), присваивание `value` тихо не действует, и select показывает «Any» — пользователь незаметно создаёт правило для любого метода.
- **Фикс:** динамически добавлять недостающий метод опцией или показывать его отдельным полем.

### m10. `sidepanel/app.js:244, 154-159` — нет обработки ошибок
- Падение `chrome.storage.local.set` в `saveRuleFromForm` не перехватывается: модалка закрывается, правило теряется, ошибки нет; `addLog` не валидирует форму `msg.entry` — битый entry роняет `renderRequests`.
- **Фикс:** try/catch с видимым сообщением об ошибке; проверять поля entry перед push.

### m11. `manifest.json:9` — permission `scripting` заявлен, но нигде не используется
- ТЗ требовал его, так что это не ошибка, а лишняя permission (шире surface, чем нужно).

### m12. `content-main.js:52-57` — regex компилируется на каждом запросе в main-потоке
- `new RegExp(rule.urlPattern)` на каждый запрос — лишний GC/CPU; плюс ReDoS: случайный паттерн вида `(a+)+$` на длинном URL может подвесить страницу.
- **Фикс:** кэш скомпилированных RegExp (Map по pattern, очистка при смене правил); валидировать regex при Save в модалке.

### m13. `sidepanel/app.js:125-152` — полный перерендер списка на каждый лог
- До 200 строк пересоздаётся на каждый запрос; при частом трафике — заметный DOM-churn.
- **Фикс:** дописывать строки инкрементально / батчить через `requestAnimationFrame`.

### m14. `README.md` — не описаны ограничения
- После перезагрузки расширения уже открытые вкладки не получают патч до перезагрузки страницы (специфика MV3); `file://` страницы не покрываются; логируется только fetch/XHR (саб-ресурсы `<script>`/`<img>` не видны — на простых страницах список может казаться пустым); мок не виден в DevTools Network (см. M7).
- **Фикс:** дополнить раздел Limitations.

## VERIFIED-OK

- **Идемпотентность инъекций**: guard `window.__responseMockInstalled` (content-main.js:2-3) — патч ставится ровно один раз на фрейм.
- **Live-обновление правил**: `storage.onChanged` → broadcast в SW (`background.js:36-40, 15-26`) + собственный listener bridge (`content-bridge.js:55-61`); `rules` в MAIN world заменяется атомарно (`content-main.js:91`). Тумблер off мгновенно возвращает реальные запросы без перезагрузки; гонки при замене нет; двойная доставка правил (SW + bridge) безвредна.
- **Персистентность**: правила в `chrome.storage.local`; badge переживает перезапуск (`onInstalled`/`onStartup`).
- **Правый клик по запросу**: `contextmenu` → `preventDefault` → модалка с авто-заполненным URL (`sidepanel/app.js:296-301`); левый клик тоже работает (бонус ТЗ).
- **Модалка/правил**: все поля ТЗ на месте (URL-паттерн, substring/regex, Method, Status, Status Text, Content-Type, Body, Delay, Enabled); Save создаёт/обновляет по id; список правил с тумблерами on/off и Delete; вкладки Requests/Rules.
- **Badge** с числом активных правил (`background.js:6-13`).
- **Безопасность side panel**: все пользовательские данные проходят через `escapeHtml` перед `innerHTML` (`app.js:12-16, 78-81, 143-148`) — XSS отсутствует; `eval`/CDN/фреймворков/билда нет — соответствует ТЗ.
- **postMessage**: `targetOrigin "*"` допустим (обмен внутри одного window между ISOLATED/MAIN); логи содержат только URL самой страницы.
- **MV3-структура**: `side_panel.default_path`, `world: "MAIN"`, `all_frames: true`, `run_at: document_start` (патч раньше скриптов страницы), `host_permissions: <all_urls>`, service worker с асинхронным ответом (`return true` для `rm-get-logs`).
- **AbortController в нативном пути**: несопавшиеся запросы идут через `nativeFetch` без изменений; mock-путь учитывает `init.signal` (и pre-aborted, и abort во время delay).
- **Логирование fetch**: реальные запросы логируются при ответе и при reject (status 0); добавление `.then`-обработчика не превращает нативный reject в unhandled rejection.
- **Delay** через `setTimeout` для fetch и XHR — как в ТЗ.
- **Иконки**: валидные PNG 16/48/128 (проверено утилитой `file`).
- **Ядро workflow**: right-click → модалка → 404 + body → следующие совпавшие запросы возвращают мок (fetch и XHR с дефолтным responseType) — базовая механика работает.

## Итог

**Счётчики:** CRITICAL — 1 · MAJOR — 7 · MINOR — 14

**Top-3 проблемы:**
1. **C1** — невалидные `exclude_matches`-паттерны в манифесте: риск, что расширение вообще не загрузится (приёмка №1).
2. **M1–M3 (XHR-мок)** — синхронная доставка событий, игнор `responseType` (JSON!), сломанный `abort`: реальные приложения ломаются или виснут.
3. **M4–M6 (fetch-мок)** — игнор `Request.signal`, `TypeError` на 1xx/204-с-телом, отсутствие `Content-Length`: мок расходится с реальным HTTP там, где код приложения на это опирается.
