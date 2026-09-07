Для V1.2 нужно исправить и доработать

Есть несколько регрессий уровня P0:
- Панель сохраняет задержку как delayMs, а перехватчики читают delay. Поэтому заданная пользователем задержка фактически превращается в 0: [app.js (line 724)](/home/hunter/mprojects/request_override/sidepanel/app.js:724), [background.js (line 109)](/home/hunter/mprojects/request_override/background.js:109).
- Логи содержат duration, а UI ждёт durationMs, поэтому длительность не показывается: [background.js (line 82)](/home/hunter/mprojects/request_override/background.js:82), [app.js (line 269)](/home/hunter/mprojects/request_override/sidepanel/app.js:269).
- Service worker возвращает { entries }, UI ищет { logs }. При открытии или обновлении панели история не восстанавливается: [background.js (line 707)](/home/hunter/mprojects/request_override/background.js:707), [app.js (line 618)](/home/hunter/mprojects/request_override/sidepanel/app.js:618).
- Background рассылает live-логи, но side panel вообще не подписан на chrome.runtime.onMessage. То есть live-список сейчас архитектурно разорван: отправка есть в [background.js (line 665)](/home/hunter/mprojects/request_override/background.js:665), в UI присутствует только listener storage в [app.js (line 849)](/home/hunter/mprojects/request_override/sidepanel/app.js:849).
- Любой CORS preflight сейчас автоматически завершается permissive-ответом, даже если ни одно правило не совпало. Это может менять поведение тестируемого приложения вне override: [background.js (line 485)](/home/hunter/mprojects/request_override/background.js:485).
- Форма разрешает статусы 100–599, но runtime принимает только 200–599. Например, правило 101 будет показано в UI как 101, но отработает как 200: [index.html (line 122)](/home/hunter/mprojects/request_override/sidepanel/index.html:122), [content-main.js (line 55)](/home/hunter/mprojects/request_override/content-main.js:55).
- Одно активное правило подключает debugger ко всем открытым HTTP-вкладкам. Это лишние жёлтые плашки, пауза каждого запроса через Fetch и неприятное ощущение, что расширение вмешивается везде: [background.js (line 545)](/home/hunter/mprojects/request_override/background.js:545).
Корневая причина нескольких дефектов — одна и та же модель данных нормализуется независимо в background, content script и side panel. Контракт уже разъехался.
План v1.2
1. Сначала восстановить надёжность
- Ввести единую схему Rule и RequestLog: везде использовать delayMs, durationMs, entries.
- Вынести общие лимиты, нормализацию и matching в один shared.js, подключаемый без сборки.
- Добавить schemaVersion и миграцию существующих правил с delay на delayMs без потери данных.
- Починить восстановление и live-доставку логов.
- Ограничить status диапазоном 200–599; для 204/205/304 принудительно убирать body.
- Пропускать настоящий preflight, если правило не совпало. Для совпавшего правила искать его по значению Access-Control-Request-Method.
- Добавить master switch «Overrides enabled».
- Не подключать debugger при отсутствии включённых применимых правил и гарантированно отключать его после выключения последнего правила.
Это release blocker: новые UX-функции нельзя строить поверх расходящихся контрактов.
2. Сделать основной путь «запрос → сценарий → готово»
На строке запроса добавить кнопку Quick override и такое же меню по правому клику:
- 200 Empty
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 429 Too Many Requests
- 500 Internal Error
- 503 Unavailable
- Slow 2s
- Custom…
Выбор пресета сразу создаёт и включает правило. Полная форма остаётся для настройки.
URL-паттерн формировать разумно:
- по умолчанию — method + origin/path без query;
- варианты Exact URL / Path / Regex;
- query-параметры добавлять только явно;
- подсвечивать, сколько текущих запросов совпадёт;
- предупреждать, если новое правило перекрывается существующим.
Это заодно устранит проблему, когда правило, созданное из маскированного URL с ***, никогда не совпадает с настоящим запросом.
3. Превратить Requests в удобный журнал
- Показывать запросы только текущей вкладки.
- Добавить строку поиска и фильтры method/status/mocked.
- Добавить Pause recording.
- Группировать повторяющиеся method + path, показывая счётчик, с возможностью раскрыть повторы.
- Новые записи добавлять инкрементально или батчем, а не перерисовывать до 200 DOM-строк на каждый запрос.
- Показывать, какое правило сработало и через какой режим: Network или In-page.
- Исправить состояния панели: Idle, Active, Fallback, Debugger conflict, вместо бесконечного Checking….
Опционально, но очень ценно для фронтендеров: «Use current response as mock». Захватывать status, Content-Type и body до установленного лимита, обязательно с выключаемой настройкой из-за чувствительных данных.
4. Сделать правила управляемыми
Для каждого правила добавить:
- короткое имя;
- scope: Current site по умолчанию, дополнительно This tab и All sites;
- явный priority/order, потому что сейчас молча побеждает первое совпадение;
- Duplicate;
- hit count и Last matched;
- предупреждение о конфликте;
- Undo после удаления.
Для командной работы:
- Export/Import JSON с версией схемы;
- копирование выбранных правил в clipboard;
- merge/replace при импорте с предпросмотром конфликтов.
Полноценные облачные workspace и синхронизацию в v1.2 я бы не включал: переносимого JSON уже достаточно, чтобы коллеги начали обмениваться сценариями.
5. Тесты и документация
Минимальный release gate:
- unit-тесты matching, миграции и общего контракта;
- contract-тест: сохранённое side panel правило одинаково читается обоими перехватчиками;
- fetch/XHR matrix: JSON, text, abort, timeout, delay, 204, 404, 500;
- CORS-тест: несовпавший preflight не изменяется;
- Chrome E2E: открыть fixture, увидеть лог, создать preset, получить заданный status/body, выключить правило;
- import/export round trip;
- smoke-тест на частом трафике.
[REVIEW.md (line 1)](/home/hunter/mprojects/request_override/REVIEW.md:1) стоит либо удалить после переноса актуальных проблем в issues, либо обновить: сейчас заголовок говорит, что проблемы исправлены, а ниже продолжает описывать их как открытые.
Предлагаемый порядок
1. P0 contracts, live logs, delay, CORS, status — 1–2 дня.
2. Scope/debugger lifecycle и ясные состояния — 1–2 дня.
3. Quick presets, smart URL, фильтры — 2–3 дня.
4. Rule priority, export/import, undo — 2 дня.
5. E2E, документация, polishing — 1–2 дня.