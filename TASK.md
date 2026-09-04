# Task: Response-Mocker browser extension (Manifest V3)

Сделай расширение для Chrome (Manifest V3) в этой директории (`~/projects/plugin`), которое позволяет пользователю **меняет ответ HTTP-запроса и код ответа в несколько кликов** — для тестирования рабочего web-приложения. Не исследуй и не копируй существующие альтернативы (ModHeader, Requestly и т.п.) — делаешь с нуля по этому ТЗ.

## Как работает (обязательная механика)
1. **Патч `fetch` и `XMLHttpRequest` в MAIN world** текущей вкладки. Content-скрипт (world: "MAIN") перехватывает запросы по правилам и возвращает **синтетический `Response`** (fetch) / подменяет status/statusText/responseText (XHR), **не выполняя реальный запрос**. Это единственный надёжный способ в MV3 полностью подменить ответ (любой status + тело) — service worker так не умеет, не пытайся через `chrome.devtools` или `declarativeNetRequest` (они не дают подменить тело ответа).
   - Правила (rules): match по URL (substring или regex), method (опц.), и override: `status`, `statusText`, `contentType`, `body` (string), `delay` (ms, опц.).
   - Правила хранятся в `chrome.storage.local`.
2. **Передача правил в страницу**: MAIN world не имеет доступа к chrome.* API. Нужен мост: content-скрипт в ISOLATED world читает storage и передаёт правила в MAIN world через `window.postMessage` / CustomEvent (объявить `content_scripts` дважды: один для ISOLATED world, один для MAIN world). Правила обновляются live через `chrome.storage.onChanged` → отправка в открытые вкладки (tabs.sendMessage) без перезагрузки страницы.
3. **Выбор запроса «правым щелчком»**: в Chrome нельзя повесить контекст-меню на сетевой запрос. Реализуй так:
   - **Side panel** (chrome.sidePanel) открывающийся на вкладку, где в реальном времени **список запросов страницы** (method, URL, status, длительность) — собирается тем же MAIN-world патчем (логирование каждого fetch/XHR).
   - **Правый клик (contextmenu) по строке запроса** в списке открывает **модальное окно** с полями: URL-паттерн (auto-filled из выбранного запроса), match type (substring/regex), Method, **Status Code**, Status Text, Content-Type, **Body** (textarea), Delay (ms), Enabled (toggle).
   - Кнопка «Save rule» создаёт/обновляет правило в storage.local. Список активных правил с тумблерами on/off и кнопкой delete — тоже в side panel (вкладки: "Requests" / "Rules").
   - Left-click по строке тоже может открывать модалку (бонус), но **правый клик обязателен**.

## UI / UX
- Без фреймворков, без билда: чистый HTML/CSS/JS, чтобы пользователь мог «Load unpacked» из папки/GitHub без сборки.
- Side panel: тёмная или светлая чистая тема, читаемый шрифт. Модальная модалка (overlay + dialog) — не отдельная вкладка.
- Action badge (иконка расширения) показывает число активных правил (chrome.action.setBadgeText).
- Все тексты UI на английском.

## Архитектура файлов
```
manifest.json          # MV3
background.js          # service worker: sidePanel.open на клик, badge, storage sync → tabs.sendMessage
content-bridge.js      # ISOLATED world: слушает storage.onChanged и messages, шлёт правила в MAIN world (postMessage), собирает логи запросов от MAIN и выводит их в side panel
content-main.js        # MAIN world: патч fetch/XHR, лог запросов, application правил (mock), отправка логов в ISOLATED (postMessage)
sidepanel/index.html
sidepanel/app.js
sidepanel/style.css
icons/                 # PNG 16/48/128 (простая иконка: молния в круге; сгенерируй скриптом или SVG→PNG, либо SVG иконку — Chrome поддерживает SVG? Нет — нужны PNG. Сгенерируй PNG через canvas в node или простой генерацией)
README.md              # как установить (Load unpacked), как пользоваться, ограничения
```
- `side_panel` key в manifest с default_path sidepanel/index.html.
- Permissions: `"sidePanel", "storage", "tabs", "scripting"` + `"host_permissions": ["<all_urls>"]` (нужно для инъекции в любую вкладку). `content_scripts` с `all_frames: true`, два блока: ISOLATED world и MAIN world (world: "MAIN").
- Патч fetch/XHR должен быть идемпотентным (проверка `window.__responseMockInstalled`), не ломать страницу (try/catch, корректная работа с AbortController, `Request`/`Response` API).
- Если страница не http(s) (chrome://, extension pages) — просто не инжектить (исключить в content-скриптах через exclude_matches: chrome://*, chrome.google.com, chrome.webstore, *://devtools*, и т.п.).
- Delay: если задан, mock-ответ возвращается после setTimeout delay ms.
- Body: если contentType application/json — тело отдаётся как есть (строка); fetch-Response создаётся через `new Response(body, {status, statusText, headers})`.

## Приёмка
- [ ] Расширение ставится через `chrome://extensions → Load unpacked` в эту папку (структура корректная, manifest валиден).
- [ ] На странице (например, httpbin.org или любое API-приложение) в side panel виден живой список запросов.
- [ ] Правый клик по запросу → модалка → ставишь status 404 + body → Save → следующие совпадающие запросы возвращают 404/тело (видно по бейджу `MOCKED` в side panel, в консоли приложения или `console.log(await res.text())`; мок — синтетический ответ в JS и в DevTools → Network не попадает, см. README → Limitations).
- [ ] Тумблер off → запросы снова реальные, без перезагрузки страницы.
- [ ] Правила переживают перезагрузку расширения и браузера (storage.local).
- [ ] Иконки 16/48/128 PNG на месте.
- [ ] README.md: установка из GitHub zip (clone/download → Load unpacked), скриншоты не обязательны, но описан workflow.

## Ограничения
- Никаких внешних CDN/библиотек в рантайме (можно node для генерации иконок при сборке, но в самом расширении — чистый JS).
- Никаких TypeScript/bundlers — только чистый JS, чтобы «скачал с GitHub — Load unpacked».
