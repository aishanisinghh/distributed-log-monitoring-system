# Distributed Log Monitoring System

A production-ready distributed log monitoring stack that streams structured JSON logs from multiple microservices into Loki and surfaces them in a real-time dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Services                             │
│  auth-service :5001   order-service :5002   payment-service :5003  │
└──────────────────────────┬──────────────────────────────────┘
                           │ stdout logs
                    ┌──────▼───────┐
                    │   Promtail   │  (tails Docker container logs)
                    └──────┬───────┘
                           │ push
                    ┌──────▼───────┐
                    │     Loki     │  :3100
                    └──────┬───────┘
                           │ query
                    ┌──────▼───────┐
                    │   FastAPI    │  dashboard-backend :8000
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   Next.js    │  dashboard-frontend :3000
                    └──────────────┘
```

| Service              | Port  | Description                              |
|----------------------|-------|------------------------------------------|
| dashboard-frontend   | 3000  | Next.js UI — log viewer & health cards   |
| dashboard-backend    | 8000  | FastAPI — queries Loki, exposes REST API  |
| loki                 | 3100  | Log aggregation store                    |
| auth-service         | 5001  | Sample microservice (generates logs)     |
| order-service        | 5002  | Sample microservice (generates logs)     |
| payment-service      | 5003  | Sample microservice (generates logs)     |
| promtail             | —     | Ships container logs to Loki             |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose v2+
- Git

---

## Quick Start (Docker — Recommended)

### ▶ Start all services (fresh / clean build)

```bash
# Pull latest code
git pull

# Build images and start all containers in the background
docker compose up --build -d
```

> First run takes a few minutes while Docker builds images and pulls base layers.

### ▶ Start without rebuilding (subsequent runs)

```bash
docker compose up -d
```

### ⏹ Stop all services (keep data)

```bash
docker compose down
```

### ⏹ Stop all services and remove volumes (full clean reset)

```bash
docker compose down -v --remove-orphans
```

> ⚠️ This deletes all Loki-stored log data. Use this to start completely fresh.

### 🔄 Restart a single service

```bash
# Replace <service> with: loki, promtail, auth-service, order-service, payment-service, dashboard-backend, dashboard-frontend
docker compose restart <service>
```

### 🗑 Nuke everything and rebuild from scratch

```bash
docker compose down -v --remove-orphans
docker compose up --build -d
```

---

## View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f dashboard-backend
docker compose logs -f auth-service
```

---

## Service Status

```bash
docker compose ps
```

---

## Access Points

| URL                          | Description              |
|------------------------------|--------------------------|
| http://localhost:3000        | Dashboard UI             |
| http://localhost:8000/health | Backend health check     |
| http://localhost:8000/docs   | FastAPI Swagger UI       |
| http://localhost:3100/ready  | Loki readiness probe     |

---

## Manual / Dev Mode (without Docker)

### Backend (FastAPI)

```bash
cd dashboard/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Next.js)

```bash
cd dashboard/frontend
npm install
npm run dev
```

Open http://localhost:3000 to view the dashboard.

---

## API Reference

| Method | Endpoint   | Description                                      |
|--------|------------|--------------------------------------------------|
| GET    | `/`        | Root health check                                |
| GET    | `/health`  | Loki + all service health summary                |
| GET    | `/services`| List of known services                           |
| GET    | `/logs`    | Query logs (`service`, `level`, `since`, `search`, `limit`) |
| GET    | `/errors`  | Shortcut for error-level logs                    |

**Example log query:**
```
GET http://localhost:8000/logs?service=auth-service&level=error&since=1h&limit=100
```

---

## Environment Variables

### Backend (`dashboard-backend`)

| Variable            | Default                          | Description                        |
|---------------------|----------------------------------|------------------------------------|
| `LOKI_URL`          | `http://loki:3100`               | Loki base URL                      |
| `AUTH_SERVICE_URL`  | `http://auth-service:5000/health`| Auth health endpoint               |
| `ORDER_SERVICE_URL` | `http://order-service:5000/health`| Order health endpoint             |
| `PAYMENT_SERVICE_URL`| `http://payment-service:5000/health`| Payment health endpoint        |
| `HEALTH_TIMEOUT`    | `2.5`                            | Health check timeout (seconds)     |

### Frontend (`dashboard-frontend`)

| Variable              | Default                  | Description             |
|-----------------------|--------------------------|-------------------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000`  | FastAPI backend base URL|

---

## CI/CD Pipeline (Jenkins)

The project ships with a `Jenkinsfile` that automates the full delivery pipeline:

```
Checkout → SonarQube Analysis → Build & Test → Deploy to Staging → Deploy to AWS
```

### Jenkins Credentials Required

| Credential ID  | Type                    | Description                          |
|----------------|-------------------------|--------------------------------------|
| `sonar-token`  | Secret text             | SonarQube authentication token       |
| `aws-ec2-key`  | SSH Username + Private Key | EC2 `.pem` key, username: `ubuntu` |

### Add `aws-ec2-key` in Jenkins

1. **Manage Jenkins → Credentials → (global) → Add Credentials**
2. Kind: **SSH Username with private key**
3. ID: `aws-ec2-key`
4. Username: `ubuntu`
5. Private Key: paste contents of your `.pem` file
6. Save

---

## AWS Deployment

The Jenkins pipeline SSHs into your EC2 instance and runs `scripts/deploy.sh`:

```bash
# On the EC2 instance (ubuntu@<EC2-IP>)
cd /home/ubuntu/distributed-log-monitoring-system
git pull
sudo ./scripts/deploy.sh
```

`deploy.sh` installs Docker + Docker Compose (if needed) and runs:

```bash
sudo docker-compose up -d --build
```

---

## Troubleshooting

| Symptom                       | Fix                                                                 |
|-------------------------------|---------------------------------------------------------------------|
| No logs appearing in UI       | Ensure Promtail can read `/var/lib/docker/containers` on the host   |
| Health cards show "down"      | Check `docker compose ps` — all services must be `running`         |
| Loki not ready                | Wait ~10s after startup, then refresh. Check `docker compose logs loki` |
| Port already in use           | Stop conflicting process or change port in `docker-compose.yml`    |
| Fresh start needed            | Run `docker compose down -v --remove-orphans && docker compose up --build -d` |

---

## Project Structure

```
.
├── services/
│   ├── auth-service/       # Flask microservice
│   ├── order-service/      # Flask microservice
│   └── payment-service/    # Flask microservice
├── monitoring/
│   ├── loki-config.yaml
│   └── promtail-config.yaml
├── dashboard/
│   ├── backend/            # FastAPI app
│   └── frontend/           # Next.js app
├── scripts/
│   └── deploy.sh           # AWS EC2 deployment script
├── docker-compose.yml
├── Jenkinsfile
└── sonar-project.properties
```