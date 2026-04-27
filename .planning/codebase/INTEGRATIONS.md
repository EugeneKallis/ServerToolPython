# ServerToolPython — Integrations

## Redis Pub/Sub Channels

Redis is the messaging backbone between all microservices.

| Channel | Publisher | Subscriber | Transport |
|---|---|---|---|
| `agent_commands` | Backend | Agent | pub/sub |
| `agent_responses` | Agent | Backend, Frontend (via WS) | pub/sub |
| `arr_config_requests` | Microservices (on startup) | Backend | pub/sub |
| `arr_config_updates` | Backend | Arr searcher, Magnet Bridge | pub/sub |
| `scraper_commands` | Backend | Scraper | pub/sub |
| `scraper_results` | Scraper | Backend | LPUSH/BRPOP queue |
| `arr_commands` | Backend | Arr searcher | LPUSH/BRPOP queue |

### agent_commands

Triggers command execution on the agent.

```json
{
  "type": "execute|kill",
  "command": "ls -la /mnt",
  "macro_name": "List Files",
  "run_id": "uuid-v4",
  "is_last": true
}
```

- `type: kill` — kills current process and clears queue
- `is_last: true` — signals final command in a multi-command macro

### agent_responses

Streams execution output from the agent back to the backend and frontend.

```json
{
  "status": "started|streaming|completed|error|reset",
  "run_id": "uuid-v4",
  "command": "ls -la /mnt",
  "macro_name": "List Files",
  "is_last": true,
  "message": "stdout line",
  "error": "stderr line",
  "exit_code": 0
}
```

Status lifecycle: `started` → `streaming` (N times) → `completed|error`

### arr_config_updates

Broadcasts all Radarr/Sonarr instance configuration to microservices.

```json
[
  {
    "id": 1,
    "name": "radarr-main",
    "type": "radarr",
    "url": "http://192.168.1.100:7878",
    "api_key": "abc123",
    "enabled": true
  }
]
```

Published by backend whenever an ArrInstance is created, updated, or deleted.

### scraper_results

Items scraped from sources, pushed as a queue (LPUSH/BRPOP, not pub/sub — survives backend restarts).

```json
{
  "source": "141jav|projectjav|pornrips",
  "items": [
    {
      "title": "...",
      "image_url": "https://...",
      "magnet_link": "magnet:?xt=...",
      "torrent_link": "https://...",
      "tags": "tag1,tag2",
      "files": [
        { "magnet_link": "magnet:?xt=...", "file_size": "2.5GB", "seeds": 10, "leechers": 5 }
      ]
    }
  ]
}
```

---

## WebSocket

**`WS /ws/terminal`**

Every message published to `agent_responses` is forwarded verbatim to all connected WebSocket clients. The frontend `TerminalContext.tsx` subscribes and renders the feed.

---

## HTTP API Endpoints

Base path: `/api`

### Config
| Method | Path | Description |
|---|---|---|
| GET | `/` | Health check + Redis status |
| GET | `/config` | Returns `{ ollama_host }` |

### Macros
| Method | Path | Description |
|---|---|---|
| GET | `/macros` | List all (with commands) |
| POST | `/macros` | Create |
| GET | `/macros/{id}` | Get one |
| PATCH | `/macros/{id}` | Update |
| DELETE | `/macros/{id}` | Delete (cascades) |
| POST | `/macros/{id}/execute` | Publish to `agent_commands` |

Execute request body: `{ "selected_arguments": { "<command_id>": [<arg_id>, ...] } }`

### Macro Groups
| Method | Path | Description |
|---|---|---|
| GET | `/macro-groups` | List with nested macros + commands |
| POST | `/macro-groups` | Create |
| PATCH | `/macro-groups/{id}` | Update |
| DELETE | `/macro-groups/{id}` | Delete (cascades) |
| POST | `/macro-groups/import` | Replace entire hierarchy (bulk import) |

### Commands
| Method | Path | Description |
|---|---|---|
| GET | `/commands` | List all |
| POST | `/commands` | Create |
| PATCH | `/commands/{id}` | Update |
| DELETE | `/commands/{id}` | Delete |
| POST | `/commands/{id}/arguments` | Add argument |
| DELETE | `/commands/arguments/{arg_id}` | Delete argument |

### Script Runs
| Method | Path | Description |
|---|---|---|
| GET | `/script-runs` | List history (`?macro=`, `?limit=`, `?offset=`) |
| GET | `/script-runs/{run_id}` | Get single run |
| DELETE | `/script-runs` | Clear all history |

### Arr Instances
| Method | Path | Description |
|---|---|---|
| GET | `/arr-instances` | List all |
| POST | `/arr-instances` | Create (broadcasts config) |
| PUT | `/arr-instances/{id}` | Update (broadcasts config) |
| DELETE | `/arr-instances/{id}` | Delete (broadcasts config) |
| POST | `/arr-instances/search_all` | Trigger search on all instances |
| POST | `/arr-instances/{id}/search` | Trigger search on one instance |

### Scraper
| Method | Path | Description |
|---|---|---|
| GET | `/scraper/items` | List items (`?source=`) |
| PATCH | `/scraper/items/{id}/hide` | Mark hidden |
| PATCH | `/scraper/items/{id}/downloaded` | Mark downloaded |
| POST | `/scraper/items/undo-hide` | Restore last hidden (`?source=`) |
| DELETE | `/scraper/items` | Delete all (`?source=` optional) |
| POST | `/scraper/trigger` | Trigger scrape (`?source=`) |
| POST | `/scraper/trigger-all` | Trigger all sources |
| POST | `/scraper/refresh` | Delete + force rescrape (`?source=`) |
| GET | `/scraper/status` | Live scraper status per source |
| POST | `/scraper/bridge` | Proxy to Magnet Bridge |

### Agent
| Method | Path | Description |
|---|---|---|
| POST | `/agent/reset` | Kill + clear queue |

### Chat
| Method | Path | Description |
|---|---|---|
| GET | `/chat/conversations` | List all |
| POST | `/chat/conversations` | Create |
| GET | `/chat/conversations/{id}` | Get one |
| PATCH | `/chat/conversations/{id}` | Update title |
| DELETE | `/chat/conversations/{id}` | Delete (cascades messages) |
| POST | `/chat/conversations/{id}/messages` | Add message |
| POST | `/chat/extract-pdf` | Extract text from PDF (multipart) |

---

## External Services

### Ollama

**Env:** `OLLAMA_HOST` (default: `http://localhost:11434`)

Used by the frontend `ChatTerminal` component for LLM streaming. The backend exposes the host via `GET /api/config`. Backend does not call Ollama directly — the frontend calls it.

### Radarr / Sonarr

**Storage:** `ArrInstance` table (url, api_key, type, enabled)

API keys stored plaintext in PostgreSQL and broadcast in plaintext via Redis. N8n receives the config via webhook and makes HTTP calls to Radarr/Sonarr.

### Decypharr (Debrid)

**Env:** `DECYPHARR_URL` (default: `http://192.168.1.99:8282`)

Used by Magnet Bridge for torrent resolution and debrid download handling. Not called directly from the backend.

### Magnet Bridge

**Env:** `MAGNET_BRIDGE_URL` (default: `http://magnet-bridge:8081`)

Backend proxies scraper bridge requests to `{MAGNET_BRIDGE_URL}/api/{MANAGED_CATEGORY}/add`. Payload:

```json
{
  "arr": "special",
  "downloadUncached": "true",
  "urls": "magnet:?xt=..."
}
```

---

## Environment Variables

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend | — | PostgreSQL connection string |
| `REDIS_URL` | backend, agent | `redis://redis:6379/0` | Redis connection |
| `OLLAMA_HOST` | backend | `http://localhost:11434` | Ollama API base URL |
| `POSTGRES_USER` | db | — | DB username |
| `POSTGRES_PASSWORD` | db | — | DB password |
| `POSTGRES_DB` | db | — | Database name |
| `DECYPHARR_URL` | magnet_bridge | `http://192.168.1.99:8282` | Debrid service |
| `TORRENT_DEST_DIR` | magnet_bridge | `/mnt/debrid/media` | Download destination |
| `APP_ENVIRONMENT` | frontend | `Local` | Display label |
| `APP_DOCKER_TAG` | frontend | `dev` | Display label |
| `WATCHPACK_POLLING` | frontend | `true` | Hot reload in Docker |
| `TZ` | backend | `America/New_York` | Scheduler timezone |

---

## Key Data Flows

### Macro Execution
```
POST /api/macros/{id}/execute
  → Backend publishes to agent_commands (one message per command)
  → Agent executes subprocess, streams lines to agent_responses
  → Backend run_log_listener persists ScriptRun in PostgreSQL
  → Backend WS forwards agent_responses to frontend in real-time
```

### Arr Config Sync
```
POST /api/arr-instances
  → Backend saves ArrInstance to DB
  → Backend publishes arr_config_updates to Redis
  → Arr searcher updates its in-memory config
  → POST /api/arr-instances/{id}/search
  → Backend pushes to arr_commands queue
  → Arr searcher pops and calls Radarr/Sonarr HTTP API
```

### Scraper
```
POST /api/scraper/trigger?source=141jav
  → Backend publishes to scraper_commands
  → Scraper fetches and parses source
  → Scraper LPUSH results to scraper_results queue
  → Backend BRPOP from scraper_results
  → Backend creates ScrapedItem + ScrapedItemFile records
```

---

## Security Notes

- Arr API keys stored **plaintext** in PostgreSQL and transmitted via Redis
- Redis has **no authentication** (trusts Docker internal network)
- All API endpoints have **no authentication layer** — open to anyone on the network
- Agent executes **arbitrary shell commands** published to Redis — critical trust boundary
- Docker socket mounted in agent container — agent has full Docker host access
