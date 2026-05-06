# Distributed Log Monitoring System

## Overview
This project streams logs from three microservices into Loki and surfaces them in a dashboard. The dashboard backend is built with FastAPI and the frontend is built with Next.js.

## Architecture
- Microservices: Auth, Order, Payment (generate JSON logs to stdout)
- Log pipeline: Promtail tails Docker container logs into Loki
- Dashboard backend: FastAPI API to query Loki
- Dashboard frontend: Next.js UI for filtering and reading logs

Key paths:
- Services: [services](services)
- Monitoring stack: [monitoring](monitoring)
- Dashboard backend (FastAPI): [dashboard/backend](dashboard/backend)
- Dashboard frontend (Next.js): [dashboard/frontend](dashboard/frontend)

## Setup Guide

### Prerequisites
- Docker and Docker Compose
- Node.js 18+
- Python 3.11+

### 1) Start the entire stack
You can now start everything with:
```bash
docker compose up --build


### 2) Run the FastAPI backend (Manual/Dev)
```bash
cd dashboard/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 3) Run the Next.js frontend (Manual/Dev)
```bash
cd dashboard/frontend
npm install
npm run dev
```

Open http://localhost:3000 to view the dashboard.

### 4) Validate the pipeline
- Verify Loki is reachable: http://localhost:3100/ready
- Confirm the backend health endpoint: http://localhost:8000/health
- The dashboard shows service health cards and log counts.

## Configuration

### Frontend
- `NEXT_PUBLIC_API_URL`: Override the FastAPI base URL for the frontend (default: `http://localhost:8000`).

### Backend
- `LOKI_URL`: Loki base URL (default: `http://localhost:3100`).
- `AUTH_SERVICE_URL`: Auth service health endpoint (default: `http://localhost:5001/health`).
- `ORDER_SERVICE_URL`: Order service health endpoint (default: `http://localhost:5002/health`).
- `PAYMENT_SERVICE_URL`: Payment service health endpoint (default: `http://localhost:5003/health`).
- `HEALTH_TIMEOUT`: Timeout in seconds for health checks (default: `2.5`).

## API Endpoints
- `GET /`: Health check
- `GET /health`: Loki + service health summary
- `GET /services`: Known services list
- `GET /logs`: Query logs with filters
	- Query params: `service`, `level`, `since` (e.g. `15m`, `1h`, `6h`), `search`, `limit`
- `GET /errors`: Convenience endpoint for error-level logs

## Ports
- 3000: Next.js dashboard
- 8000: FastAPI backend
- 3100: Loki
- 5001: Auth service
- 5002: Order service
- 5003: Payment service

## Troubleshooting
- No logs in the UI: ensure Docker is running and Promtail can read container logs from `/var/lib/docker/containers` on the host.
- Health cards show down: confirm the services are up in [project/monitoring/docker-compose.yml](project/monitoring/docker-compose.yml) and the ports above are free.
- Loki not ready: wait a few seconds after `docker-compose up` before the dashboard fetch.

## Notes
- Each microservice emits JSON logs with `service`, `level`, `message`, and `timestamp` fields. The backend parses these fields for the dashboard UI.