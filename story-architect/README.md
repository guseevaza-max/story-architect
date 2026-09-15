# Story Architect

Система управления сложной художественной вселенной. Автор принимает
решения, AI анализирует, предлагает, пишет и отслеживает последствия.
Ни один факт не попадает в канон без подтверждения автора.

## Запуск

```bash
cp .env.example .env        # заполнить AI_API_KEY и AUTH_SECRET
npm install
docker compose up -d db     # или указать свой DATABASE_URL (Supabase)
npm run db:migrate
npm run db:seed             # тестовая вселенная «The Last Cycle»
npm run dev
```

Без ключа модели: `AI_MOCK=true` — весь пайплайн проходится на заглушках.

```bash
npm test         # тесты
npm run lint     # включая проверку границы AI ↛ Canon
npm run typecheck
```

## Архитектура

```
Браузер → Next.js (UI + API) → Prisma → PostgreSQL + pgvector
                             ↘ AI Router → Provider → Model
```

Ключевой инвариант: `src/lib/ai/**` не может импортировать
`src/lib/canon/write`. AI создаёт только `Proposal`; канон меняет автор.
Правило проверяется ESLint и архитектурным тестом.

### Структура

```
prisma/schema.prisma      схема БД (ТЗ п. 71)
src/lib/canon/            шлюз канона — ядро системы
  actor.ts                тип-барьер AuthorActor
  proposal-state.ts       машина состояний предложения
src/lib/ai/               слой AI, без доступа к записи канона
  provider.ts             Router → Provider → Model, единственное место с ключом
docs/adr/                 принятые архитектурные решения
tests/                    тесты инвариантов и границы модулей
```

## Документация

- `docs/adr/` — архитектурные решения с обоснованием
- `PHASE0_ARCHITECTURE.md` — анализ референсов, память, Context Pack
- `ТЗ_соответствие.md` — матрица покрытия всех разделов ТЗ

## Референсы

Архитектурные ориентиры изучены, код не заимствован. Подробности и
лицензионные заключения — в отчёте PHASE 0. Репозиторий
`chenyu1ov3/novel-agent` из ТЗ не существует и исключён из референсов
по согласованию с заказчиком.
