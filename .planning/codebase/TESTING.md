# Testing Strategy & Framework

## Test Stack

| Tool | Purpose |
|---|---|
| `pytest` | Test runner and discovery |
| `httpx` / `TestClient` | HTTP requests against FastAPI app |
| SQLite `:memory:` | Isolated in-memory test database |
| `StaticPool` | Single shared connection for all threads |

Dependencies in `backend/requirements.txt`: `pytest`, `httpx`, `sqlalchemy`

---

## Running Tests

```bash
make test                          # Run all backend tests
cd backend && pytest tests/ -v     # Verbose
pytest tests/test_macros.py -v     # Single file
pytest tests/test_macros.py::test_create_macro -v  # Single test
```

---

## Test Organization

```
backend/tests/
├── conftest.py          # Fixtures: in-memory DB, TestClient, session override
├── test_macros.py       # Macro CRUD
├── test_commands.py     # Command CRUD
└── test_macro_groups.py # MacroGroup CRUD
```

---

## Database Setup (conftest.py)

```python
SQLALCHEMY_DATABASE_URL = "sqlite://"  # pure in-memory

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

@pytest.fixture(name="session")
def session_fixture():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)  # clean slate after each test

@pytest.fixture(name="client")
def client_fixture(session):
    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app, base_url="http://testserver/api/")
    app.dependency_overrides.clear()
```

Key points:
- Tables created fresh per test, dropped after — no cross-test pollution
- `dependency_overrides` injects the test session into all FastAPI routes
- Base URL includes `/api/` prefix to match production routing

---

## Test Patterns

### Create
```python
def test_create_macro(client):
    group = client.post("/macro-groups", json={"name": "Group"}).json()
    res = client.post("/macros", json={"name": "My Macro", "macro_group_id": group["id"]})
    assert res.status_code == 200
    assert res.json()["name"] == "My Macro"
```

### Update (PATCH)
```python
def test_update_macro(client):
    macro_id = client.post("/macros", json={"name": "Old"}).json()["id"]
    res = client.patch(f"/macros/{macro_id}", json={"name": "New"})
    assert res.json()["name"] == "New"
```

### Delete
```python
def test_delete_macro(client):
    macro_id = client.post("/macros", json={"name": "Delete Me"}).json()["id"]
    client.delete(f"/macros/{macro_id}")
    assert client.get(f"/macros/{macro_id}").status_code == 404
```

---

## What Is Tested

- CRUD for `Macro`, `Command`, `MacroGroup`
- Correct field values in responses
- Ordering by `ord` field
- 404 on missing resources
- Cascading deletes (delete parent removes children)

## What Is NOT Tested

| Gap | Risk |
|---|---|
| `/api/macros/{id}/execute` (Redis publish) | High — core feature |
| WebSocket `/ws/terminal` | High — real-time output |
| Agent pub/sub flow end-to-end | High |
| APScheduler / cron execution | Medium |
| Arr instance API calls | Medium |
| Ollama chat streaming | Medium |
| All frontend components | High — zero automated coverage |
| Database migrations | Low |

---

## CI Integration

Tests are **not run in the Woodpecker CI pipeline** — only Docker builds occur. Tests are run manually before pushing.

To add to CI, insert a pytest step before the build steps in `.woodpecker/dev-deploy.yml`:
```yaml
- name: test
  image: python:3.11-slim
  commands:
    - cd backend && pip install -r requirements.txt && pytest tests/ -v
```

---

## Coverage Estimate

| Layer | Coverage |
|---|---|
| Backend CRUD endpoints | ~60% |
| Backend async/WebSocket/execute | 0% |
| Frontend components | 0% |
| **Overall** | ~20-25% |

---

## Recommended Next Steps

1. Test the `/execute` endpoint with a mocked Redis client
2. Add WebSocket test fixtures (FastAPI supports `TestClient` WebSocket connections)
3. Add a pytest step to the Woodpecker CI pipeline
4. Add Jest/Vitest for frontend components
