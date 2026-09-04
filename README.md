# Request Override

[Русский](#request-override-ru) | [English](#request-override-en)

---

<a id="request-override-ru"></a>
## Request Override (RU)

**Request Override** — Chrome-расширение (Manifest V3) для замены HTTP-ответов: статусного кода, статуса, `Content-Type` и тела ответа. Предназначено для тестирования web-приложений: можно быстро сделать `404`, `500`, пустой JSON, задержку или кастомный body, не трогая бэкенд.

Интерфейс панели по умолчанию на русском, есть переключатель на английский. Слева у панели есть стрелка: она сворачивает панель в компактную вертикальную полоску.

## Установка

1. Скачайте или склонировали репозиторий.
2. Откройте `chrome://extensions`.
3. Включите **Режим разработчика**.
4. Нажмите **Load unpacked** / **Загрузить распакованное расширение** и выберите папку `plugin` (там, где лежит `manifest.json`).
5. Откройте любую http(s)-страницу и нажмите иконку расширения — откроется side panel.

После изменений нажмите кнопку обновления на карточке расширения.

## Как пользоваться

1. Откройте страницу, которая делает `fetch` или `XMLHttpRequest` запросы.
2. В панели на вкладке **Запросы** появятся live-строки: метод, имя запроса, статус, длительность, полный URL и бейдж `MOCKED` для подменённых запросов.
3. Правый клик (или левый клик / Enter) по строке запроса открывает форму правила.
4. Заполните нужные поля и нажмите **Сохранить правило**.
5. Совпадающие запросы теперь возвращают заданный ответ.
6. Вкладка **Правила** позволяет включать, редактировать и удалять правила без перезагрузки страницы.

Полезные действия в панели:

- **Обновить** — перечитать список запросов и статус.
- **Диагностика** — показать JSON-состояние service worker.
- **Очистить журнал** — убрать сохранённые request-логи из панели и буферов страницы.
- **Маскировать query-параметры** — заменять значения query-параметров на `***` в логах.

## Режимы

### Сетевой перехват (по умолчанию)

Service worker подключает Chrome debugger к http(s)-вкладкам и перехватывает запросы на сетевом уровне через CDP `Fetch`. Совпадающие запросы отвечаются заданным статусом, заголовками и телом. Такие запросы видны в **DevTools → Network**.

Пока debugger подключён, Chrome может показывать стандартную жёлтую плашку о debugging. Это ожидаемое поведение.

### Встраивание в страницу (fallback)

Если сетевой режим выключен или debugger не мог подключиться, content script в MAIN world патчит `fetch` и `XMLHttpRequest`. Ответ создаётся в JS страницы и **не попадает** в DevTools → Network. Проверять такой mock можно по бейджу `MOCKED`, по UI приложения или в консоли страницы.

## Поля правила

| Поле | Описание |
|---|---|
| URL-паттерн | Подстрока или regex, сопоставляется с полным URL запроса |
| Тип совпадения | `substring` или `regex` |
| Метод | Необязательно; пусто означает любой метод |
| Код статуса | 100–599 |
| Статус-текст | Необязательный reason phrase |
| Content-Type | Ответный заголовок `Content-Type` |
| Тело ответа | Строка тела |
| Задержка, мс | Искусственная задержка перед ответом |
| Включено | Вкл/выкл правило |

Лимиты: до 100 правил, URL-паттерн до 1000 символов, status text до 200 символов, content type до 300 символов, body до 1 МБ, delay до 60000 мс.

## Файлы

```text
manifest.json          MV3-манифест
background.js          service worker: side panel, badge, правила, CDP Fetch interception, логи
content-bridge.js      ISOLATED world: мост storage → MAIN world и буфер логов
content-main.js        MAIN world: патч fetch/XHR, мок, логи
sidepanel/index.html   разметка панели
sidepanel/app.js       логика панели, локализация, UI
sidepanel/style.css    тёмная тема
icons/                 PNG-иконки 16/48/128
generate-icons.js      Node-скрипт пересборки иконок
validate.js            Node-скрипт базовой проверки
```

## Ограничения

- Работает только с http(s)-страницами. `chrome://`, extension pages, web store и `file://` исключены.
- Логируются и мокаются только `fetch` и `XMLHttpRequest`. Subresources (`<script>`, `<img>`, `<link>`) и WebSockets не видны.
- Сетевой режим требует permission `debugger`. Chrome показывает предупреждение о расширенных правах и плашку debugging.
- Если DevTools или другое расширение уже подключены к вкладке, debugger может не подключиться; расширение переходит в in-page fallback.
- После перезагрузки расширения уже открытые страницы нужно перезагрузить один раз, чтобы content script снова попал на страницу.
- In-page mock не виден в DevTools → Network.
- `fetch` с `no-cors` в JS страницы остаётся opaque response.
- Range-запросы не эмулируются как 206 + `Content-Range`.
- Полный query-string может содержать токены. Включите **Маскировать query-параметры**, если хотите не хранить значения в логах.
- Rules передаются в страницу через `postMessage` с token. Страница теоретически может подделать правила для собственного frame; полноценно защититься от page JS в content-script расширении нельзя.

## Безопасность и приватность

- Правила и настройки хранятся в `chrome.storage.local` на вашем устройстве.
- Extension не отправляет правила, URL или тела на внешние серверы.
- `host_permissions: <all_urls>` нужны, чтобы патчить `fetch`/`XMLHttpRequest` на любой http(s)-странице.
- `debugger` permission нужен для сетевого перехвата и видимости mock в DevTools → Network.
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

The side panel defaults to Russian and includes an English fallback. The left arrow collapses the panel into a compact vertical strip.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `plugin` folder (the one containing `manifest.json`).
5. Open any http(s) page and click the extension icon — the side panel opens.

After changes, press the refresh button on the extension card.

## Usage

1. Open a page that makes `fetch` or `XMLHttpRequest` requests.
2. In the **Requests** tab you will see live rows: method, request name, status, duration, full URL, and a `MOCKED` badge for mocked requests.
3. Right-click (or left-click / Enter) a request row to open the rule form.
4. Fill in the required fields and click **Save rule**.
5. Matching requests now return the configured response.
6. The **Rules** tab lets you enable, edit, and delete rules without reloading the page.

Useful panel actions:

- **Refresh** — reload request logs and status.
- **Diagnostics** — show service worker state as JSON.
- **Clear logs** — clear stored request logs from the panel and page buffers.
- **Mask query params** — replace query parameter values with `***` in logs.

## Modes

### Network-level interception (default)

The service worker attaches the Chrome debugger to http(s) tabs and intercepts requests at the network layer using CDP `Fetch`. Matching requests are fulfilled with your status, headers, and body. These requests appear in **DevTools → Network**.

While attached, Chrome may show its standard yellow debugging infobar. This is expected.

### In-page fallback

If network-level mode is disabled or the debugger cannot attach, a MAIN-world content script patches `fetch` and `XMLHttpRequest`. The response is synthesized in page JavaScript and does **not** appear in DevTools → Network. Verify such mocks using the `MOCKED` badge, the app UI, or the page console.

## Rule fields

| Field | Meaning |
|---|---|
| URL pattern | Substring or regex matched against the full request URL |
| Match type | `substring` or `regex` |
| Method | Optional; empty means any method |
| Status code | 100–599 |
| Status text | Optional reason phrase |
| Content-Type | Response `Content-Type` header |
| Body | Response body as a string |
| Delay (ms) | Artificial latency before the mocked response |
| Enabled | On/off toggle |

Limits: up to 100 rules, 1000-character URL pattern, 200-character status text, 300-character content type, 1 MB body, 60000 ms delay.

## Files

```text
manifest.json          MV3 manifest
background.js          service worker: side panel, badge, rules, CDP Fetch interception, logs
content-bridge.js      ISOLATED world: storage → MAIN world bridge and log buffer
content-main.js        MAIN world: fetch/XHR patch, mocking, logging
sidepanel/index.html   side panel markup
sidepanel/app.js       side panel logic, localization, UI
sidepanel/style.css    dark theme
icons/                 PNG icons 16/48/128
generate-icons.js      Node script for regenerating icons
validate.js            Node script for lightweight validation
```

## Limitations

- Works only with http(s) pages. `chrome://`, extension pages, web store, and `file://` pages are excluded.
- Only `fetch` and `XMLHttpRequest` are logged and mocked. Subresources (`<script>`, `<img>`, `<link>`) and WebSockets are invisible.
- Network-level mode requires the `debugger` permission. Chrome shows an elevated-permission warning and a debugging infobar.
- If DevTools or another extension already owns the tab debugger, attach may fail; the extension falls back to in-page mode.
- After reloading the extension, already-open pages need one manual reload so the content script is injected again.
- In-page mocks are not visible in DevTools → Network.
- `no-cors` fetches remain opaque responses in page JavaScript.
- Range requests are not emulated as 206 + `Content-Range`.
- Full query strings may contain tokens. Enable **Mask query params** if you do not want query values stored in logs.
- Rules reach the page via token-guarded `postMessage`. Page JavaScript can theoretically forge rule updates for its own frame; content-script extensions cannot fully protect against page JS.

## Security and privacy

- Rules and settings are stored in `chrome.storage.local` on your device.
- The extension does not send rules, URLs, or bodies to external servers.
- `host_permissions: <all_urls>` is required to patch `fetch`/`XMLHttpRequest` on any http(s) page.
- The `debugger` permission is required for network-level interception and DevTools → Network visibility.
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
