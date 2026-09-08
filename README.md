# Request Override

[Русский](#request-override-ru) | [English](#request-override-en)

---

<a id="request-override-ru"></a>
## Request Override (RU)

**Request Override** — Chrome-расширение (Manifest V3) для замены HTTP-ответов: статусного кода, статуса, `Content-Type` и тела ответа. Предназначено для тестирования web-приложений: можно быстро сделать `404`, `500`, пустой JSON, задержку или кастомный body, не трогая бэкенд.

Интерфейс панели по умолчанию на русском, есть переключатель на английский.

## Установка

1. Скачайте или склонируйте репозиторий.
2. Откройте `chrome://extensions`.
3. Включите **Режим разработчика**.
4. Нажмите **Load unpacked** / **Загрузить распакованное расширение** и выберите папку репозитория, в которой лежит `manifest.json`.
5. Откройте любую http(s)-страницу и нажмите иконку расширения — откроется side panel.

После изменений нажмите кнопку обновления на карточке расширения.

## Как пользоваться

1. Откройте страницу, которая делает `fetch` или `XMLHttpRequest` запросы.
2. В панели на вкладке **Запросы** появятся live-строки: метод, имя запроса, статус, длительность, полный URL и бейдж `MOCKED` для подменённых запросов.
3. Правый клик (или левый клик / Enter) по строке запроса открывает форму правила.
4. Заполните нужные поля и нажмите **Сохранить правило**.
5. Совпадающие запросы теперь возвращают заданный ответ.
6. Вкладка **Правила** позволяет включать, редактировать и удалять правила без перезагрузки страницы.

Самый быстрый путь: нажмите `+` у запроса или откройте его контекстное меню и выберите готовый сценарий — `401`, `403`, `404`, `429`, `500`, `503`, пустой `200` или медленный `200`. Правило создаётся для текущего сайта и URL без параметров после `?`. Повторный запрос получит выбранный статус и будет показан с этим статусом в **DevTools → Network**.

Полезные действия в панели:

- **Статусы в DevTools** — включить сетевую подмену, при которой заданный HTTP-статус отображается в Network.
- **Диагностика** — скопировать JSON-состояние service worker в буфер обмена.
- **Очистить журнал** — убрать сохранённые request-логи из панели и буферов страницы.
- **Скрывать параметры URL** — заменять в журнале значения после `?` на `***`, например `?token=***`.
- **Подмены** — общий выключатель всех правил без их удаления.
- Поиск и фильтры позволяют оставить нужный method/status или только `MOCKED`.
- Правила можно упорядочивать по приоритету, дублировать и переносить JSON-файлом.

## Режимы

### Сетевой перехват (по умолчанию)

Service worker подключает Chrome debugger только к http(s)-вкладкам, для которых есть применимое включённое правило, и перехватывает запросы на сетевом уровне через CDP `Fetch`. Совпадающие запросы отвечаются заданным статусом, заголовками и телом. Такие запросы видны в **DevTools → Network**: правило `500` даёт сетевой status `500`.

Пока debugger подключён, Chrome может показывать стандартную жёлтую плашку о debugging. Это ожидаемое поведение.

### Встраивание в страницу (fallback)

Если сетевой режим выключен или debugger не мог подключиться, content script в MAIN world патчит `fetch` и `XMLHttpRequest`. Ответ создаётся в JS страницы и **не попадает** в DevTools → Network. Проверять такой mock можно по бейджу `MOCKED`, по UI приложения или в консоли страницы.

## Поля правила

| Поле | Описание |
|---|---|
| URL-паттерн | Путь, полный URL или регулярное выражение |
| Тип совпадения | `Path`, `Exact URL` или `Regex` |
| Метод | Необязательно; пусто означает любой метод |
| Код статуса | 200–599 |
| Статус-текст | Необязательный reason phrase |
| Content-Type | Ответный заголовок `Content-Type` |
| Тело ответа | Строка тела |
| Задержка, мс | Искусственная задержка перед ответом |
| Область | Текущий сайт, конкретная вкладка или все сайты |
| Приоритет | При пересечении правил побеждает больший приоритет |
| Включено | Вкл/выкл правило |

Лимиты: до 100 правил, URL-паттерн до 1000 символов, status text до 200 символов, content type до 300 символов, body до 1 МБ, delay до 60000 мс.

## Файлы

```text
manifest.json          MV3-манифест
shared.js              единая схема, миграция, matching и общие лимиты
background.js          service worker: side panel, badge, правила, CDP Fetch interception, логи
content-bridge.js      ISOLATED world: мост storage → MAIN world и буфер логов
content-main.js        MAIN world: патч fetch/XHR, мок, логи
sidepanel/index.html   разметка панели
sidepanel/app.js       логика панели, локализация, UI
sidepanel/style.css    тёмная тема
icons/                 PNG-иконки 16/48/128
generate-icons.js      Node-скрипт пересборки иконок
validate.js            Node-скрипт базовой проверки
tests/                 Локальная fixture-страница и ручной Chrome E2E-сценарий
```

## Ограничения

- Работает только с http(s)-страницами. `chrome://`, extension pages, web store и `file://` исключены.
- Логируются и мокаются только `fetch` и `XMLHttpRequest`. Subresources (`<script>`, `<img>`, `<link>`) и WebSockets не видны.
- Сетевой режим требует permission `debugger`. Chrome показывает предупреждение о расширенных правах и плашку debugging.
- Если DevTools или другое расширение уже подключены к вкладке, debugger может не подключиться; расширение переходит в in-page fallback.
- В состоянии **In-page fallback** подмена работает для fetch/XHR, но синтетический ответ не появляется в DevTools Network. Для видимого сетевого статуса состояние панели должно быть **Сетевой перехват активен**.
- После перезагрузки расширения уже открытые страницы нужно перезагрузить один раз, чтобы content script снова попал на страницу.
- `fetch` с `no-cors` в JS страницы остаётся opaque response.
- Range-запросы не эмулируются как 206 + `Content-Range`.
- Параметры URL могут содержать токены. Включите **Скрывать параметры URL**, если не хотите хранить их значения в журнале.
- Rules передаются в страницу через `postMessage` с token. Страница теоретически может подделать правила для собственного frame; полноценно защититься от page JS в content-script расширении нельзя.

## Безопасность и приватность

- Правила и настройки хранятся в `chrome.storage.local` на вашем устройстве.
- Extension не отправляет правила, URL или тела на внешние серверы.
- `host_permissions: <all_urls>` нужны, чтобы патчить `fetch`/`XMLHttpRequest` на любой http(s)-странице.
- `debugger` permission нужен для сетевого перехвата и видимости mock в DevTools → Network.
- `webRequest` permission используется только для локального журнала fetch/XHR текущей вкладки и чтения их итоговых статусов.
- Логи запросов ограничены 200 записями на вкладку и могут содержать URL с query-параметрами.

## Разработка

Без сборки и зависимостей. Для базовой проверки:

```bash
node validate.js
```

Пересобрать иконки:

```bash
node generate-icons.js
```

## Лицензия

MIT. Подробности в файле `LICENSE`.

---

<a id="request-override-en"></a>
## Request Override (EN)

**Request Override** is a Manifest V3 Chrome extension for overriding HTTP responses: status code, status text, `Content-Type`, and response body. It is designed for testing web applications: quickly return `404`, `500`, empty JSON, delayed responses, or custom bodies without changing the backend.

The side panel defaults to Russian and can be switched to English.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository folder containing `manifest.json`.
5. Open any http(s) page and click the extension icon — the side panel opens.

After changes, press the refresh button on the extension card.

## Usage

1. Open a page that makes `fetch` or `XMLHttpRequest` requests.
2. In the **Requests** tab you will see live rows: method, request name, status, duration, full URL, and a `MOCKED` badge for mocked requests.
3. Right-click (or left-click / Enter) a request row to open the rule form.
4. Fill in the required fields and click **Save rule**.
5. Matching requests now return the configured response.
6. The **Rules** tab lets you enable, edit, and delete rules without reloading the page.

The fastest flow is to press `+` on a request or open its context menu and choose `401`, `403`, `404`, `429`, `500`, `503`, an empty `200`, or a slow `200`. The rule is scoped to the current site and uses the URL without parameters after `?`. Repeating the request produces that exact status in **DevTools → Network**.

Useful panel actions:

- **DevTools statuses** — enable network-level overriding so the configured HTTP status appears in Network.
- **Diagnostics** — copy the service worker JSON state to the clipboard.
- **Clear logs** — clear stored request logs from the panel and page buffers.
- **Hide URL parameters** — replace values after `?` in the journal with `***`, for example `?token=***`.
- **Overrides** — pause every rule without deleting it.
- Search and filters narrow the journal by method/status or `MOCKED` requests.
- Rules support priority, duplication, and JSON import/export.

## Modes

### Network-level interception (default)

The service worker attaches the Chrome debugger only to http(s) tabs with an applicable enabled rule and intercepts requests at the network layer using CDP `Fetch`. Matching requests are fulfilled with your status, headers, and body. These requests appear in **DevTools → Network**: a `500` rule produces network status `500`.

While attached, Chrome may show its standard yellow debugging infobar. This is expected.

### In-page fallback

If network-level mode is disabled or the debugger cannot attach, a MAIN-world content script patches `fetch` and `XMLHttpRequest`. The response is synthesized in page JavaScript and does **not** appear in DevTools → Network. Verify such mocks using the `MOCKED` badge, the app UI, or the page console.

## Rule fields

| Field | Meaning |
|---|---|
| URL pattern | Path, full URL, or regular expression |
| Match type | `Path`, `Exact URL`, or `Regex` |
| Method | Optional; empty means any method |
| Status code | 200–599 |
| Status text | Optional reason phrase |
| Content-Type | Response `Content-Type` header |
| Body | Response body as a string |
| Delay (ms) | Artificial latency before the mocked response |
| Scope | Current site, a specific tab, or every site |
| Priority | Higher priority wins when rules overlap |
| Enabled | On/off toggle |

Limits: up to 100 rules, 1000-character URL pattern, 200-character status text, 300-character content type, 1 MB body, 60000 ms delay.

## Files

```text
manifest.json          MV3 manifest
shared.js              canonical schema, migration, matching, and shared limits
background.js          service worker: side panel, badge, rules, CDP Fetch interception, logs
content-bridge.js      ISOLATED world: storage → MAIN world bridge and log buffer
content-main.js        MAIN world: fetch/XHR patch, mocking, logging
sidepanel/index.html   side panel markup
sidepanel/app.js       side panel logic, localization, UI
sidepanel/style.css    dark theme
icons/                 PNG icons 16/48/128
generate-icons.js      Node script for regenerating icons
validate.js            Node script for lightweight validation
tests/                 Local fixture page and manual Chrome E2E scenario
```

## Limitations

- Works only with http(s) pages. `chrome://`, extension pages, web store, and `file://` pages are excluded.
- Only `fetch` and `XMLHttpRequest` are logged and mocked. Subresources (`<script>`, `<img>`, `<link>`) and WebSockets are invisible.
- Network-level mode requires the `debugger` permission. Chrome shows an elevated-permission warning and a debugging infobar.
- If DevTools or another extension already owns the tab debugger, attach may fail; the extension falls back to in-page mode.
- In **In-page fallback**, fetch/XHR mocking still works but the synthetic response is absent from DevTools Network. The panel must say **Network interception active** for a DevTools-visible status.
- After reloading the extension, already-open pages need one manual reload so the content script is injected again.
- `no-cors` fetches remain opaque responses in page JavaScript.
- Range requests are not emulated as 206 + `Content-Range`.
- URL parameters may contain tokens. Enable **Hide URL parameters** if you do not want their values stored in the journal.
- Rules reach the page via token-guarded `postMessage`. Page JavaScript can theoretically forge rule updates for its own frame; content-script extensions cannot fully protect against page JS.

## Security and privacy

- Rules and settings are stored in `chrome.storage.local` on your device.
- The extension does not send rules, URLs, or bodies to external servers.
- `host_permissions: <all_urls>` is required to patch `fetch`/`XMLHttpRequest` on any http(s) page.
- The `debugger` permission is required for network-level interception and DevTools → Network visibility.
- The `webRequest` permission is used only for the local current-tab fetch/XHR journal and their final statuses.
- Request logs are capped at 200 entries per tab and may contain URLs with query parameters.

## Development

No build step and no runtime dependencies. Run lightweight validation:

```bash
node validate.js
```

Regenerate icons:

```bash
node generate-icons.js
```

## License

MIT. See `LICENSE`.
