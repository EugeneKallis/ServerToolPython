# ServerToolPython

ServerToolPython is a full-stack application designed to manage, execute, and monitor commands via a streaming terminal interface. The project features a modular architecture spanning a Next.js frontend, a FastAPI Python backend, and a dedicated worker agent, all orchestrated via Docker.

## Architecture Overview

The system consists of several interconnected services defined in `docker-compose.yml`:

- **Frontend (Next.js)**: A dynamic web interface featuring a real-time streaming terminal UI built with React and Tailwind CSS.
- **Backend (FastAPI)**: Serves API endpoints, handles business logic, and manages core database operations and WebSockets routing.
- **Agent (Python)**: An independent worker service responsible for listening to execution events, running commands, and streaming outputs dynamically.
- **Database (PostgreSQL 15)**: The primary relational database storing structured data models (Commands, Macros, etc.).
- **Cache & Pub/Sub (Redis 7)**: Acts as the high-speed message broker routing command output between the executing agent, backend routers, and the frontend WebSocket connection.

## Key Features Built So Far

### 1. Frontend & Terminal UI
- **Real-Time Streaming Terminal**: Implemented a responsive terminal component (`Terminal.tsx` and `TerminalContext.tsx`) designed to render continuous streams of command outputs.
- **WebSocket Integration**: Seamlessly receives active logs from the agent to display inside the terminal in real-time.
- **Modern UI Components**: Utilizing Lucide React styling for clear, aesthetic dashboard and component presentation.

### 2. Modular Backend
- **Refactored Architecture**: Rebuilt to separate concerns into clear modules (`routers/`, `models.py`, `schemas.py`, and `database.py`).
- **Relational Models**: Constructed comprehensive SQLAlchemy models outlining the relationships between `MacroGroup`, `Macro`, and `Command` entities.
- **Enhanced Scalability**: Refactored the data layer from a flat SQLite file over to robust PostgreSQL and Redis setups, laying the foundation for eventual Kubernetes deployments.
- **Comprehensive Test Suite**: A robust suite of isolated integration tests utilizing `pytest` to validate CRUD endpoints across all primary models.

### 3. Execution Agent
- A dedicated background Python process connected directly to Redis. It executes registered commands and reliably publishes the chunked terminal outputs back to the Redis Pub/Sub channel for the backend to ingest and forward to the frontend.

## Quick Start (Development)

The application uses `docker-compose` to start the entire stack effortlessly.

```bash
# Build and start all services
docker-compose up --build
```

- **Frontend**: Available at `http://localhost:3000`
- **Backend API**: Available at `http://localhost:8080`
- **Postgres Database**: Port `5432`
- **Redis Broker**: Port `6379`

## Deployment & CI/CD (Kubernetes + Helm)

This project deploys to a Kubernetes cluster via a unified Helm chart using Komodo for CI/CD.

### Helm Configuration
All application microservices (Frontend, Backend, Agent, Redis, Postgres) are bundled into a single Helm Chart located in the `kubernetes-cluster` repository at `charts/servertool-python/`.
Global parameters such as image variants and replica counts are defined centrally in `charts/servertool-python/values-dev.yaml` and `charts/servertool-python/values-prod.yaml`.

You can use the built-in Makefile targets to interact with Helm locally:
- `make helm-deploy` - Upgrades or installs the cluster.
- `make helm-uninstall` - Tears down the deployment.
- `make helm-template` - Renders the manifest templates locally for debugging.
- `make helm-lint` - Lints the Helm configuration syntax.
