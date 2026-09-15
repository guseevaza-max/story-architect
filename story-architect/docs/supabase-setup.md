# Подключение Supabase

Шаги на стороне заказчика/владельца проекта. Занимает ~10 минут.

## 1. Создать проект
supabase.com → New project. Регион — ближайший к пользователям.
Пароль базы сохранить: он больше нигде не показывается.

## 2. Включить pgvector
SQL Editor → выполнить:

```sql
create extension if not exists vector;
```

Проверка:

```sql
select extname, extversion from pg_extension where extname = 'vector';
```

## 3. Получить строки подключения
Project Settings → Database → Connection string → URI.

Нужны **две**:

| Переменная | Порт | Назначение |
|---|---|---|
| `DATABASE_URL` | 6543 (Transaction pooler) | работа приложения, обязателен `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | 5432 (Direct connection) | только миграции Prisma |

Через пул миграции не проходят: pgbouncer не держит сессионные блокировки,
которые нужны Prisma при изменении схемы.

## 4. Заполнить .env
Скопировать `.env.example` → `.env`, подставить обе строки и пароль.
Сгенерировать секрет сессий:

```bash
openssl rand -base64 32
```

## 5. Применить схему

```bash
npm install
npm run db:migrate    # создаст таблицы
npm run db:seed       # тестовая вселенная «The Last Cycle»
```

## Замечания по безопасности

- `.env` в репозиторий не попадает (в `.gitignore`).
- Пароль базы и ключ AI хранятся только на сервере.
- Row Level Security в Supabase не используется: доступ к базе идёт с
  backend под сервисной ролью, изоляция данных обеспечивается на уровне
  приложения через `Project.userId`. При переходе к публичному сервису
  это решение нужно будет пересмотреть — зафиксировано в ADR-0006.
