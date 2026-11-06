# p35 · Функциональная инвентаризация Story Architect

Состояние: ветка `p1-lore-ai`, коммит `3fe18f6` (p31–p34 установлены).
Метод: чтение кода (страницы, компоненты, API-маршруты, `src/lib`, `prisma/schema.prisma`, тесты). Приложение не запускалось, платных запросов не было, код и данные не менялись.

Условные обозначения:
- **Подтверждено** — прямо видно в коде, указан файл.
- **Гипотеза** — вывод по косвенным признакам, перед изменениями нужно проверить в работающем приложении.
- «Пишет напрямую» — запись в базу, минуя `applyProposal()`. Для ввода автора это допустимо, для ИИ — нет (см. раздел «Кто пишет в Canon»).

Сокращения путей: `P` = `src/app/projects/[id]`, `C` = `src/app/projects/[id]/chapters/[chapterId]`, `API` = `src/app/api`.

---

## 0. Масштаб

- 15 карточек-ссылок на главной странице проекта (`P/page.tsx`, 428 строк): Материалы мира, Canon, Сюжетная карта, Экспорт, Расходы ИИ, Story Bible, Предложения AI, Characters, World, Chapters, Memory, Relationships, Plot Lines, Timeline, Референсы (плюс блок «Информация о проекте»). Это не 11 разделов, а 15; из них 5 (Characters, World, Relationships, Plot Lines, Timeline) только для чтения.
- 22 файла `page.tsx` (включая вход, регистрацию, Dashboard, создание проекта), 26 файлов с `"use client"`, 39 маршрутов API.
- Страница главы (`C/page.tsx`, 275 строк) собирает 12 компонентов; самый крупный — `MemoryUpdateButton.tsx` (1756 строк). Самая крупная страница проекта — `proposals/page.tsx` (1355 строк).
- В схеме 40 моделей. 11 из них не имеют ни одного обращения в коде (см. приложение A).

---

## 1. Поток главы

Статусы главы (`ChapterStatus`): IDEA → PLANNED → DRAFT → EDITING → CHECKING → APPROVED → CANON. Реально код выставляет: PLANNED (при принятии плана главы, `write.ts`), DRAFT (Writer), CHECKING (Continuity), APPROVED/CANON (кнопки), «возврат к APPROVED» при правке текста после Canon (`revertsToApproved`). Статус EDITING нигде не выставляется, только отображается в списках (**подтверждено** поиском по `status:` и `EDITING`). IDEA — значение по умолчанию.

### 1.1 Создание главы
- Назначение: завести главу в книге. Экран: `P/chapters/page.tsx` (список) + `CreateChapterForm.tsx`.
- Читает: Project → Book → Chapter. Пишет: Book (если нет), Chapter. AI: нет.
- Зависит от: ничего. Пересечения: нет. Отдельный экран нужен (список глав), но форму создания можно встроить.

### 1.2 Идея автора (`SaveIdeaForm`)
- Назначение: свободный текст «о чём глава». Экран: секция «Идея автора» на странице главы.
- Читает/пишет: `Chapter.authorIdea` через `PATCH /chapters/[id]`. AI: нет (текст читает Architect).
- Пересечения: **с Авторским замыслом** (пользователь видит две соседние секции для ввода замысла одной главы; см. duplication-audit §D1).

### 1.3 Авторский замысел (`AuthorIntentPanel`)
- Назначение: структурированный замысел главы: масштаб, драматичность, темп, референсы, свободный промпт. Схема `lib/authorIntent/schema.ts`.
- Экран: секция «Авторский замысел». API: `GET/PUT /chapters/[id]/intent`.
- Читает: `Chapter.authorIntent`, список референсов проекта (`Project.authorReferences`). Пишет: `Chapter.authorIntent` (прямая запись автора). AI: нет.
- Потребители: Architect, Scene Planner, Writer, Continuity, Revise (**подтверждено**: `lib/authorIntent/load.ts` импортируется в этих маршрутах).
- Ссылка на «Референсы» открывает отдельную страницу проекта.

### 1.4 Narrative Context (`NarrativeContextPanel`)
- Назначение: показать автору, что ИИ «знает и чего не должен раскрывать» для этой главы (вехи сюжета, тайны, ограничения на спойлеры).
- Экран: панель на странице главы. API: `GET /chapters/[id]/narrative-context`. Читает: PlotBeat, Secret, Book. Пишет: ничего. AI: нет (чистая детерминированная сборка, `lib/plotMap/narrativeContext.ts`).
- Потребители контекста: **Writer** и **Coauthor** (**подтверждено**: `loadNarrativeContext` вызывается только в `writer/route.ts`, `narrative-context/route.ts`, `lib/coauthor/context.ts`). Architect, Scene Planner, Revise и Continuity его не используют (см. duplication-audit §D6).

### 1.5 Architect (план главы)
- Назначение: превратить идею и замысел в структурированный план (цель, начальное/конечное состояние, развитие сюжета и персонажей, «обязательно/не должно», открытые вопросы).
- Экран: секция «Architect» — **последняя на странице главы** (`C/page.tsx`, после Memory Update). API: `POST /chapters/[id]/architect`, роль `STORY_ARCHITECT`.
- Читает: идея, замысел, Story State (Canon-персонажи, состояния, отношения), Chapter. Пишет: `AiRun`, **Proposal** `chapter_plan`. Canon не меняет.
- Подтверждение: на странице `P/proposals` (после принятия `applyProposal` ставит `Chapter.plan` и `planApproved`). Сообщение в `ArchitectButton` говорит «ожидает утверждения», но ссылки на страницу предложений нет (**подтверждено**: у кнопки нет `Link`).
- Зависит от: идеи/замысла. Необязателен: Writer требует только `plan` + `planApproved` (подтверждено, `writer/route.ts`), но без Architect плана нет.

### 1.6 Утверждённый план главы
- Отображение `Chapter.plan` (только после утверждения), на странице главы. Читает: Chapter. Пишет: ничего. Ответы автора на открытые вопросы вводятся на странице Proposals (`planAnswers`), а видны здесь.

### 1.7 Scene Planner
- Назначение: разбить утверждённый план на сцены. Показывается только если есть утверждённый план. API: `POST /scene-planner`, роль `SCENE_PLANNER`. Пишет: AiRun, Proposal `scene_plan`; после принятия на странице Proposals создаются `Scene`.
- Зависит от: Architect. Подтверждение так же уходит на страницу Proposals.

### 1.8 Сопоставление с Canon до написания (`ContinuityButton`, секция «Сопоставление с Canon»)
- Назначение по тексту интерфейса: «перед написанием главы AI проверяет раскадровку на противоречия».
- **Дефект (подтверждено чтением кода):** кнопка вызывает тот же `POST /continuity`, что и проверка черновика, а маршрут возвращает 400 «У главы нет черновика для проверки», если `draftText` пуст (`continuity/route.ts`, шаг 4). То есть проверка раскадровки до написания в текущем виде не работает; она работает только когда черновик уже есть. Требует проверки в браузере (гипотеза: на практике пользователь видит ошибку).
- Пересечение: тот же компонент и маршрут, что в §1.12.

### 1.9 Writer
- Назначение: сгенерировать черновик главы по плану и сценам. Экран: блок внутри секции «план сцен» (виден, если сцены есть). API: `POST /writer`, роль `WRITER`, модель Luna.
- Условия (подтверждено): глава не APPROVED/CANON (иначе 409), есть утверждённый план и сцены. Читает: план, сцены, замысел, Story State, Narrative Context, Canon-факты. Пишет: `Chapter.draftText` (черновик, не Canon), AiRun.
- Зависит от: Architect + Scene Planner. Необязательные для автора шаги (план, сцены) здесь **обязательны** — автор не может запустить Writer без них, но может писать вручную в редакторе.

### 1.10 Редактор черновика + «Доработать по заметкам» (Revise)
- Назначение: ручное редактирование текста; пометки редактора; кнопка Revise отдаёт AI заметки и получает исправленный текст (потоково, p21/p23).
- Экран: `DraftEditor.tsx` (секция «Редактор черновика», показывается всегда). API: `PATCH /chapters/[id]` (сохранение — **ручное**, кнопкой; автосохранения нет, подтверждено), `POST /revise`, роль `REVISE`.
- Пишет: `Chapter.draftText`; если глава была в Canon, правка возвращает статус к APPROVED (`revertsToApproved`). Кнопка «Обсудить с Соавтором» отправляет фрагмент в панель Coauthor (событие `coauthor:attach-fragment`).

### 1.11 Проверка непрерывности черновика (`ContinuityButton`)
- Назначение: найти противоречия черновика с планом, сценами, Canon. API: `POST /continuity`, роль `CONTINUITY_CHECK` (Luna). Пишет: `ContinuityReport`; статус главы → CHECKING (кроме APPROVED/CANON). Показывается, если есть `draftText`.

### 1.12 Предложения по исправлению (`ContinuitySuggestionsButton`)
- Назначение: по найденным проблемам получить варианты исправления, выбрать и применить их общей правкой. API: `/continuity/suggestions` (`CONTINUITY_SUGGESTIONS`), `/continuity/apply-suggestions` (`CONTINUITY_APPLY`).
- Применение показывает **предпросмотр** `revisedDraft`; запись в черновик — только после явного «принять» (`PATCH draftText`). Подтверждено.
- Зависит от: §1.11 (две кнопки в одной секции).

### 1.13 Финальное утверждение (`ApproveChapterButton`)
- `PATCH status=APPROVED`. Условия (подтверждено, `chapters/[id]/route.ts`): непустой черновик, нет пометок редактора. Canon не меняет. Показывается при `draftText` и статусе не APPROVED/CANON.

### 1.14 Перевод в Canon (`CanonChapterButton`)
- `PATCH status=CANON`: только из APPROVED, непустой текст; копирует `draftText` в `finalText`. Это **кнопка автора**, ИИ-маршрутов, способных выставить CANON, нет (Writer прямо отказывает для APPROVED/CANON; Revise в базу не пишет). Не идёт через Proposal.

### 1.15 Memory Update (`MemoryUpdateButton`, 1756 строк)
- Назначение: после Canon извлечь из главы изменения для памяти (состояния персонажей, отношения, события, факты) как предложения.
- API: `POST /memory` (`MEMORY_EXTRACTION`) и действия `POST /api/proposals/[id]/action`. Показывается при статусе CANON.
- Пишет: AiRun, Proposal(ы); `ChapterSummary`, `MemoryChunk`, `CharacterState` после принятия. Подтверждение происходит **внутри этого компонента** (в отличие от Architect/Scene Planner, где оно на другой странице). Неуверенные и конфликтующие пункты сохраняются для решения автора и в Canon не попадают (`lib/canon/memorySafety.ts`).

---

## 2. Знания и Canon

### 2.1 Story Bible (`P/story-bible/page.tsx`, 714 строк)
- Назначение: большой авторский текст «библии» + AI-анализ, который превращается в предложения.
- Читает/пишет: `Project.storyBibleText` (автосохранение через 1,5 с, предупреждение при закрытии, подтверждено). Анализ: `POST /api/ai/analyze`, роль `STORY_BIBLE_ANALYZE`; результат хранится **в браузере** (восстанавливается после перезагрузки). Предложения: `POST /story-bible/proposals` → Proposal CHARACTER / WORLD_ENTITY / WORLD_RULE / PLOT_LINE / EVENT / OPEN_QUESTION.
- Canon напрямую не меняет. Пересечение с Lore (§2.2) по роли «исходный текст автора» (см. duplication-audit §D2).

### 2.2 Lore Library («Материалы мира», `P/lore`)
- Назначение: хранить исходные авторские материалы (заметки, тексты) и извлекать из них факты.
- Читает/пишет: `LoreMaterial` (CRUD). `ExtractFactsButton` → `POST /lore/[id]/extract` (`LORE_EXTRACTION`) → Proposal `LORE_FACT` → после принятия `CanonFact`. Ссылка ведёт на Proposals.
- По документу схемы: «Исходные материалы автора. Не являются Canon автоматически».

### 2.3 Canon (`P/canon`)
- Только чтение: `CanonFact` (до 500, поиск/фильтр) + ссылка на источник (Proposal). Пишет: ничего. Это единственный экран, где видны утверждённые **атомарные факты**; персонажи/мир/события показываются на своих страницах.

### 2.4 Memory (`P/memory`, 638 строк)
- Только чтение: `ChapterSummary`, `MemoryChunk`, а также список пунктов Memory Update, помеченных неуверенными/конфликтующими. Пишется на странице главы (§1.15).

### 2.5 Characters / World / Relationships / Plot Lines / Timeline
- Все пять — **страницы только для чтения**, данные создаются исключительно через принятие Proposal (`applyProposal`). Подтверждено: `prisma.*.create/update` для этих моделей есть только в `lib/canon/write.ts`.
- Characters: Character (+ CharacterState). World: WorldEntity, WorldRule (две секции). Relationships: действующие + «История изменений». Plot Lines: PlotLine (этапы). Timeline: Event, сортировка «ось времени → глава → создание».
- Каждая содержит пустое состояние со ссылкой «Предложения AI» (то есть путь создания данных — через другой экран).
- Из этих экранов нельзя исправить опечатку в карточке персонажа напрямую: любая правка идёт через новое Proposal. Это сознательное следствие Canon Gate (см. раздел 5).

### 2.6 Референсы (`P/references`, 590 строк)
- Назначение: библиотека литературных ориентиров автора (характеристики стиля, не «пиши как X»). API: `GET/PUT /references`, хранение в `Project.authorReferences` (JSON). AI: нет. Потребитель: Авторский замысел (выбор референсов для главы).
- Модель `StyleBible` в схеме есть, но **ни разу не используется** (приложение A) — референсы хранятся в JSON проекта.

### 2.7 Proposals / Предложения AI (`P/proposals`, 1355 строк)
- Назначение: единственный экран принятия решений: принять, отредактировать и принять, отклонить; ответы автора на открытые вопросы плана главы.
- API: `GET/POST /api/proposals`, `POST /api/proposals/[id]/action` → `applyProposal()` (единственный путь в Canon, подтверждено `lib/canon/write.ts`).
- Типы предложений (entityType): `chapter_plan`, `scene_plan`, `LORE_FACT`, `CHARACTER`, `WORLD_ENTITY`, `WORLD_RULE`, `PLOT_LINE`, `EVENT`, `OPEN_QUESTION`, а также пункты Memory Update.
- Источники: Architect, Scene Planner, Memory Update (частично решается и внутри главы), Lore Extraction, Story Bible, ручной `POST /api/proposals`.

---

## 3. Сюжет

### 3.1 Plot Map (`P/plot-map`, `PlotMapClient.tsx`)
- Назначение: замысел книги, сюжетные вехи (PlotBeat), тайны с планом раскрытия (Secret: правдивая версия, с какой главы намёки/частичное раскрытие, что нельзя раскрывать рано).
- API: `/plot-map` (GET), `/beats` (CRUD, reorder), `/secrets` (CRUD), `/book` (PATCH). Это **прямые записи автора**: `Secret` создаётся со `status: "CANON"` (в коде комментарий «Создаёт автор, поэтому статус сразу CANON»). AI: нет.
- Потребители: Narrative Context → Writer и Coauthor.
- Пересечение: Plot Lines (§2.5) и Plot Map описывают сюжет в разных моделях (PlotLine vs PlotBeat); см. duplication-audit §D3.

---

## 4. ИИ-помощники и сервисные функции

### 4.1 Coauthor (`P/layout.tsx` → `CoauthorDock.tsx`, `lib/coauthor/*`)
- Назначение: беседы автора с ИИ-соавтором (Luna по умолчанию, Terra по запросу), потоковые ответы, «Сценарный критик» (строгий структурированный отчёт по главе), сжатие длинных бесед.
- Доступен на **каждой** странице проекта (плавающая кнопка), скрыт только на `/export` (`isDockHidden`). Читает: Canon, главу, Narrative Context, тайны; пишет: CoauthorThread/CoauthorMessage, AiRun. Canon не пишет и не предлагает в Proposal (сохранение решений — будущий этап).
- API: `/coauthor/threads[...]`, `/messages`, `/messages/stream`, `/summarize`. Роли: `COAUTHOR`, `COAUTHOR_CRITIC`, `COAUTHOR_SUMMARY`.

### 4.2 AI Usage (`/ai-usage`, `AiUsageSettings.tsx`)
- Назначение: расходы, месячный бюджет ($50), цены моделей, статус лимитов. API: `/api/ai-usage`, `/budget` (PATCH), `/prices` (PUT). Расположена **вне** проекта (`src/app/ai-usage`), ссылка «← На главную» ведёт на `/`, а не в проект.
- Использует `runTrackedAiCall` для всех AI-маршрутов (подтверждено аудитом `tests/ai-usage-audit.test.ts`).

### 4.3 Экспорт PDF (`P/export`)
- Читает: Book, Chapters (finalText/draft); API `GET /export/pdf`. Панель Coauthor скрыта.

### 4.4 Dashboard / проекты
- `/dashboard` — список проектов, `/projects/new` — создание. Известная проблема: ссылка «← Создать новый проект» ведёт на `/` (`dashboard/page.tsx:94`), а `/` перенаправляет обратно на Dashboard (`app/page.tsx`); должна вести на `/projects/new` (**подтверждено**, мелкий дефект).

---

## 5. Кто пишет в Canon (карта границы)

| Путь | Кто инициирует | Что меняется | Через Proposal |
|---|---|---|---|
| `applyProposal()` | автор (кнопка на странице Proposals или в Memory Update) | CanonFact, Character, WorldEntity/Rule, PlotLine, Event, OpenQuestion, Chapter.plan/planApproved, Scene, CharacterState, ChapterSummary, MemoryChunk | да (единственный путь для AI-результатов) |
| `PATCH /chapters/[id]` status=CANON | автор (кнопка) | Chapter.status, finalText | нет, но маршрут AI не вызывает |
| Plot Map CRUD | автор | PlotBeat, Secret (status CANON), Book | нет, прямой ввод автора |
| Lore, Референсы, Story Bible text, Идея, Замысел | автор | LoreMaterial, authorReferences, storyBibleText, authorIdea, authorIntent | нет, это исходные материалы |
| AI-маршруты (Architect, Scene Planner, Memory, Lore, Story Bible analyze, Writer, Revise, Continuity, Coauthor) | AI по нажатию автора | Proposal / AiRun / черновик / отчёты | AI Canon не пишет; Writer пишет только `draftText` и ставит DRAFT; Revise в базу не пишет (текст сохраняет автор через PATCH) |

Тесты границы: `tests/canon-gate.test.ts`, `tests/ai-boundary.test.ts`, `tests/memory-safety.test.ts`, `tests/lore-fact-apply.test.ts`.

---

## Приложение A. Модели без обращений в коде

Поиск по `prisma.<model>`, `tx.<model>`, `db.<model>` в `src/` не нашёл обращений к: `ChapterVersion`, `ArcStage`, `CharacterVoice`, `PlotStage`, `EventLink`, `KnowledgeFact`, `Idea`, `StoryBibleVersion`, `AiRole`, `ContinuityIssue`, `StyleBible`.

Это **не значит, что их можно удалять**: часть из них заложена под планы (матрица знаний, версии главы, версии Story Bible), и в базе пользователя могут быть данные, о которых код не знает. Рекомендация p35: ничего не удалять, но не показывать пользователю как функции, которых нет. Решение по каждой модели принимает автор.

## Приложение B. Роли ИИ → маршруты → где вызываются

| Роль (`roleKey`) | Маршрут | Экран |
|---|---|---|
| STORY_ARCHITECT | `/chapters/[id]/architect` | страница главы |
| SCENE_PLANNER | `/chapters/[id]/scene-planner` | страница главы |
| WRITER | `/chapters/[id]/writer` | страница главы |
| REVISE | `/chapters/[id]/revise` | редактор |
| CONTINUITY_CHECK / _SUGGESTIONS / _APPLY | `/chapters/[id]/continuity[...]` | страница главы (2 места для CHECK) |
| MEMORY_EXTRACTION | `/chapters/[id]/memory` | страница главы |
| LORE_EXTRACTION | `/lore/[materialId]/extract` | Lore |
| STORY_BIBLE_ANALYZE | `/api/ai/analyze` | Story Bible |
| COAUTHOR / _CRITIC / _SUMMARY | `/coauthor/threads/...` | панель Coauthor (всюду) |

Все 13 ролей с лимитами (`lib/ai/limits.ts`) идут через единый учёт AI Usage и бюджет $50.

## Приложение C. Технический долг, замеченный по ходу (не входит в p35)

- 20 файлов создают собственный `new PrismaClient()` вместо общего `@/lib/db` (в том числе `lib/canon/write.ts` и 6 страниц). В dev-режиме Next.js это даёт лишние соединения; поведение не ломает. Гипотеза о риске: исчерпание подключений при большой нагрузке.
- Ссылка «создать проект» на Dashboard (см. §4.4).
- Дубликат `OPENAI_API_KEY` в `.env`, ESLint-плагин падает при сборке (безвредное предупреждение).
