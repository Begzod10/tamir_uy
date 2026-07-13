# UyTa'mir

Uzbek renovation planning platform.

## Quick Start

```bash
# 1. Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Start all services
docker-compose up -d

# 3. Run migrations
docker-compose exec api alembic upgrade head

# 4. Seed data
docker-compose exec api python app/seeds.py

# 5. Open app
open http://localhost:5173
```

## Architecture

- Frontend: React 18 + Vite PWA + Three.js + Zustand -> localhost:5173
- Backend: FastAPI + PostgreSQL + Redis + Celery -> localhost:8000
- API docs: http://localhost:8000/docs

## Phase 1 (current)

- Measurement wizard (60-second room input)
- Isometric room preview (live SVG)
- Material catalog with UZS prices
- Smeta engine (deterministic calculations)
- Ustalar directory with lead generation
- Phone OTP authentication

## Phase 2 (next)

- 3D "Ichkarida" mode with PBR materials
- Walk controls
- PDF export polish

## Phase 3 (planned)

- Photo mode (SAM 2 segmentation)
- AI dizayner recommendations
