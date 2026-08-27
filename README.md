# IBERIAN Backend v1.0

API NestJS para la plataforma de preparación de oposiciones.

## Stack

- NestJS 11 · PostgreSQL · Prisma · JWT · Swagger · OpenAI (opcional) · Supabase Storage (opcional)

## Módulos (completos)

| Módulo | Endpoints principales |
|--------|----------------------|
| Auth | register, login, refresh, logout |
| Users | me, update profile |
| Oppositions | list, by id/code, create |
| Laws | CRUD leyes/artículos, estructura BOE |
| Questions | CRUD, filtros, favoritos |
| Tests | generate, answer, finish (+ XP/rachas/logros) |
| Statistics | me, by topic |
| Achievements | list + auto-unlock |
| Ranking | leaderboard, my position |
| Notifications | list, read, read-all |
| AI | tutor contextual |
| Subscriptions | me, limits, activate (admin) |
| Admin | dashboard, users, moderate questions |
| Files | upload-meta, public-url |

## Inicio

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/docs
- Admin seed: admin@iberian.app / Admin123!

## Variables .env

```
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=3000
OPENAI_API_KEY=          # opcional
SUPABASE_URL=            # opcional
SUPABASE_KEY=            # opcional
SUPABASE_BUCKET=iberian-files
```
