# ML / LLM Learning Plan for ServerTool

A list of practical ML/LLM features we can add to ServerTool, ordered roughly by difficulty. Each one teaches different concepts while adding real value.

---

## 1. Natural Language Command Builder (Beginner)
**What:** Type plain English like "restart nginx" or "check disk space" and have an LLM generate the actual shell command, arguments, and even full macros.

**What you'll learn:** Prompt engineering, structured output parsing, LLM API basics (Ollama or Claude API).

**Where it fits:** New endpoint + frontend component on the admin page. The LLM generates a `Command` object from a description.

**Scope:** ~1 backend route, ~1 frontend component, prompt template.

---

## 2. Smart Command Suggestions / Autocomplete (Beginner)
**What:** As you type in the terminal or create commands, suggest completions based on your existing macros, past runs, and common patterns.

**What you'll learn:** Embeddings, similarity search, basic vector storage (could use SQLite/pgvector or just cosine similarity in Python).

**Where it fits:** New `/api/suggestions` endpoint. Frontend autocomplete dropdown.

**Scope:** Embed existing commands, store vectors, query on input.

---

## 3. Script Run Output Summarizer (Beginner-Intermediate)
**What:** After a macro finishes (especially long ones), generate a one-line summary: "Completed backup of 3 databases, 2.1GB total, no errors" instead of scrolling through 500 lines.

**What you'll learn:** Text summarization, context window management, chunking long outputs.

**Where it fits:** Post-execution hook in `run_log_listener`. Add `summary` field to `ScriptRun`. Show in run-log page.

**Scope:** ~1 utility function, 1 model field, frontend tweak.

---

## 4. Error Diagnosis & Fix Suggestions (Intermediate)
**What:** When a script run fails, send the error output to an LLM and get back: what went wrong, possible causes, and suggested fixes or commands to run.

**What you'll learn:** Few-shot prompting, error classification, structured JSON responses from LLMs.

**Where it fits:** Button on failed runs in the run-log page. New `/api/script-runs/{id}/diagnose` endpoint.

**Scope:** 1 endpoint, prompt template with error context, frontend modal.

---

## 5. Scraped Content Classifier / Tagger (Intermediate)
**What:** Use a vision model or text model to auto-tag and categorize scraped items beyond the source-provided tags. Could classify quality, detect duplicates by content similarity, or generate better descriptions.

**What you'll learn:** Multimodal LLMs (image + text), classification, tagging systems.

**Where it fits:** Post-scrape hook in the scraper service. Enriches `ScrapedItem` with AI-generated tags.

**Scope:** New classification step in scraper pipeline, tag schema updates.

---

## 6. Intelligent Scheduling (Intermediate)
**What:** Analyze script run history (timing, duration, failures) and suggest optimal cron schedules. "This macro fails 40% of the time when run at 3am but succeeds at 5am" or "These two macros conflict when overlapping."

**What you'll learn:** Time-series analysis, basic ML (could be rule-based or use sklearn), anomaly detection.

**Where it fits:** New `/api/schedules/suggestions` endpoint. Analysis panel on scheduler page.

**Scope:** Query run history, build features (time, duration, status), train/apply simple model.

---

## 7. Chat-Powered Macro Builder (Intermediate)
**What:** Conversational interface where you describe what you want to automate, and the LLM iteratively builds a full macro (multiple commands, arguments, scheduling) through a back-and-forth conversation. Uses the existing chat infrastructure.

**What you'll learn:** Function calling / tool use with LLMs, multi-turn conversations, LLM-driven CRUD.

**Where it fits:** Extend the existing `/chat` page with a "Macro Builder" mode. LLM gets tools to create macros, commands, and schedules via the existing API.

**Scope:** Tool definitions for the LLM, conversation mode toggle, API integration.

---

## 8. Anomaly Detection on Command Output (Intermediate-Advanced)
**What:** Learn what "normal" output looks like for recurring macros and flag when something is off -- even if the exit code is 0. "This backup usually takes 30s but took 5min" or "Output volume dropped 90% compared to usual."

**What you'll learn:** Statistical anomaly detection, time-series baselines, alerting.

**Where it fits:** Background analysis job. New `anomalies` table. Alert on the terminal/run-log page.

**Scope:** Feature extraction from ScriptRun history, baseline modeling, alerting system.

---

## 9. RAG over Execution History (Advanced)
**What:** "When was the last time the backup failed?" or "Show me all runs that mentioned disk full" -- natural language search over your entire run history using retrieval-augmented generation.

**What you'll learn:** RAG pipeline, document chunking, vector databases (pgvector), retrieval + generation.

**Where it fits:** New search interface on run-log page. Chunks and embeds script run outputs. Query endpoint uses retrieval + LLM.

**Scope:** Embedding pipeline, vector storage, retrieval endpoint, chat-style UI.

---

## 10. Self-Healing Macros (Advanced)
**What:** When a macro fails, the system automatically diagnoses the error, generates a fix command, and (with approval) executes it. Learns from past failures and fixes.

**What you'll learn:** Agentic LLM patterns, feedback loops, human-in-the-loop workflows, reinforcement from outcomes.

**Where it fits:** Post-failure hook in agent. New approval workflow (WebSocket notification + confirm/deny). Fix history table for learning.

**Scope:** Diagnosis prompt, fix generation, approval UI, execution loop, feedback storage.

---

---

# Homelab Stack Integration Ideas

These leverage your existing services: Sonarr, Radarr, Plex, Prowlarr, qBittorrent, Homepage, n8n, Semaphore, Ansible, and Reddit.

---

## 11. Plex Watch History Recommender (Beginner-Intermediate)
**What:** Pull your Plex watch history via Tautulli/Plex API, feed it to an LLM, and get personalized recommendations. "You watched 5 sci-fi thrillers this week -- here are 10 you'd like." Then one-click add them to Radarr/Sonarr.

**What you'll learn:** API chaining, recommendation prompting, preference modeling from watch patterns.

**Where it fits:** New `/tools/recommendations` page. Backend hits Plex API for history, LLM generates recs, button sends to Radarr/Sonarr via existing arr_instances.

**Scope:** Plex API integration, recommendation prompt, Radarr/Sonarr add endpoint.

---

## 12. Reddit Content Scout (Beginner-Intermediate)
**What:** Monitor specific subreddits (r/moviesuggestions, r/selfhosted, r/homelab, etc.) and use an LLM to filter/summarize posts relevant to you. "New post in r/selfhosted about a Plex alternative with 200 upvotes" or "Someone recommended these 5 movies in r/moviesuggestions that match your taste."

**What you'll learn:** Reddit API (PRAW), content filtering with LLMs, relevance scoring, scheduled data pipelines.

**Where it fits:** New scraper source + dedicated page. Scheduled via existing cron system. Store in new `RedditPost` table.

**Scope:** Reddit API client, relevance classifier prompt, new scraper module, frontend page.

---

## 13. Ansible Playbook Generator from Macros (Intermediate)
**What:** Select a macro (or group of macros) and have an LLM convert them into a proper Ansible playbook with roles, handlers, and idempotency. "Turn my 'setup docker' macro into an Ansible role I can run via Semaphore."

**What you'll learn:** Code generation, Ansible YAML structure, LLM output validation, infrastructure-as-code concepts.

**Where it fits:** Export button on admin page. New `/api/macros/{id}/to-ansible` endpoint. Optional push to Semaphore via its API.

**Scope:** Ansible template prompt, YAML validation, Semaphore API integration.

---

## 14. Smart Download Manager (Intermediate)
**What:** LLM-powered layer on top of qBittorrent + Prowlarr. Understands quality preferences, disk space, and existing library. "I want this movie in 4K but only if I have 50GB free, otherwise grab 1080p." Auto-pauses low-priority downloads when bandwidth is needed for Plex streaming.

**What you'll learn:** Decision-making with LLMs, multi-API orchestration (qBittorrent, Prowlarr, Plex, disk APIs), rule engines.

**Where it fits:** Extend magnet-bridge or new `/tools/download-manager` page. Backend orchestrates qBittorrent API + disk checks + Plex session awareness.

**Scope:** qBittorrent API client, decision prompt with system state context, priority rules.

---

## 15. n8n Workflow Suggester (Intermediate)
**What:** Describe an automation in plain English -- "When a movie finishes downloading, rename it, notify me on Discord, and update my spreadsheet" -- and the LLM generates an n8n workflow JSON you can import directly.

**What you'll learn:** Complex JSON generation, workflow/DAG concepts, n8n node schema, LLM function calling for multi-step plans.

**Where it fits:** New page or chat mode. Backend generates n8n-compatible workflow JSON. One-click import via n8n API.

**Scope:** n8n workflow schema understanding, generation prompt, n8n API push.

---

## 16. Homelab Health Dashboard with NLP Alerts (Intermediate)
**What:** Aggregate metrics from all your services (Plex streams, Sonarr queue, qBittorrent speeds, disk usage, Semaphore job status) and use an LLM to generate a natural language daily briefing. "3 movies downloaded overnight, Plex has 0 active streams, Sonarr is waiting on 2 episodes, disk is at 78%."

**What you'll learn:** Multi-API data aggregation, summarization, templated vs freeform generation, notification systems.

**Where it fits:** New `/dashboard/ai-summary` endpoint. Could push to Homepage custom widget or Discord/Telegram. Schedule via existing cron.

**Scope:** API clients for each service, aggregation layer, summary prompt, notification delivery.

---

## 17. Semaphore + Ansible Failure Analyzer (Intermediate-Advanced)
**What:** When a Semaphore job fails, pull the Ansible output, send it to an LLM for diagnosis, and suggest the fix -- possibly as a corrected playbook diff. Track failure patterns over time to predict which playbooks are fragile.

**What you'll learn:** Log analysis, diff generation, failure pattern recognition, Semaphore API.

**Where it fits:** Poll Semaphore API for failed jobs (or webhook). New `/tools/semaphore-analyzer` page showing recent failures with AI diagnosis.

**Scope:** Semaphore API client, Ansible log parser, diagnosis prompt, failure history table.

---

## 18. Media Library Gap Analyzer (Intermediate-Advanced)
**What:** Combine Plex library data + Sonarr/Radarr wanted lists + trending data from Reddit/TMDB and use an LLM to identify gaps. "You have seasons 1-3 of this show but season 4 is out. You have every Nolan film except Tenet. These 5 trending movies from r/movies aren't in your library."

**What you'll learn:** Data joining across APIs, set operations, trend analysis, TMDB API, recommendation logic.

**Where it fits:** New `/tools/library-gaps` page. Backend joins Plex metadata + Sonarr/Radarr + external sources.

**Scope:** Multi-API data fetching, gap detection logic, LLM-powered prioritization, add-to-arr actions.

---

## 19. Conversational Server Admin via Chat (Advanced)
**What:** Turn the existing chat page into a full server admin assistant. "How much disk space is left?" triggers `df -h`. "What's downloading right now?" hits qBittorrent API. "Restart Sonarr" runs the right docker/systemctl command. The LLM has tools for all your services and executes through the existing agent.

**What you'll learn:** Agentic tool use (the core of how modern AI agents work), safety guardrails, multi-tool orchestration, confirmation workflows.

**Where it fits:** Extend existing chat with tool definitions. LLM gets access to: execute macro, query arr APIs, check qBittorrent, query Plex, run shell commands (with approval).

**Scope:** Tool schema definitions, safety layer (confirm destructive actions), response formatting, multi-service API wrappers.

---

## 20. Predictive Resource Planner (Advanced)
**What:** Train a model on historical data -- disk usage trends, download volumes, Plex transcoding load, Semaphore job durations -- to predict future resource needs. "At current rate, you'll run out of disk in 12 days." "Thursday evenings have 3x Plex streams, don't schedule heavy Ansible jobs then."

**What you'll learn:** Time-series forecasting (Prophet, ARIMA, or simple linear regression), feature engineering from real operational data, capacity planning.

**Where it fits:** Background data collection job. New `/tools/resource-planner` page with charts and predictions. Integrates with scheduler to avoid conflicts.

**Scope:** Data collection pipeline, forecasting model, visualization frontend, scheduler integration.

---

## Suggested Learning Path

| Phase | Items | Focus |
|-------|-------|-------|
| **Phase 1 - Basics** | #1, #3, #11 | API calls, prompt engineering, structured output |
| **Phase 2 - Data Pipelines** | #12, #16 | Multi-API aggregation, summarization, Reddit/Plex APIs |
| **Phase 3 - Embeddings** | #2, #9 | Vectors, similarity, RAG |
| **Phase 4 - Classification** | #4, #5, #18 | Error patterns, tagging, gap analysis |
| **Phase 5 - Code Gen** | #13, #15 | Ansible/n8n generation, YAML/JSON output validation |
| **Phase 6 - Agents** | #7, #14, #19 | Tool use, agentic loops, multi-service orchestration |
| **Phase 7 - Ops ML** | #6, #8, #17, #10 | Anomaly detection, failure analysis, self-healing |
| **Phase 8 - Forecasting** | #20 | Time-series, capacity planning, resource prediction |

---

## Tech Stack Options

| Component | Options |
|-----------|---------|
| **LLM Provider** | Ollama (already integrated), Claude API, OpenAI API |
| **Embeddings** | Ollama embeddings, sentence-transformers (local), OpenAI embeddings |
| **Vector Store** | pgvector (already have Postgres), ChromaDB, or simple numpy cosine similarity |
| **Traditional ML** | scikit-learn, pandas for feature engineering |
| **Vision** | Ollama multimodal models (llava), Claude vision |
| **Forecasting** | Prophet, statsmodels (ARIMA), or simple sklearn linear regression |
| **Reddit** | PRAW (Python Reddit API Wrapper) |
| **Arr APIs** | Sonarr v3/v4 API, Radarr v3 API, Prowlarr API (all REST/JSON) |
| **Plex** | PlexAPI (python-plexapi) or Tautulli API |
| **qBittorrent** | qbittorrent-api (Python client) |
| **n8n** | n8n REST API for workflow import/export |
| **Semaphore** | Semaphore v2 API for job status and project management |
