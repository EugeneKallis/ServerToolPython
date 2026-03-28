# Code Conventions & Patterns

## Python Backend Conventions

### Code Organization
- **Module structure**: `backend/app/` follows a feature-based organization
  - `models.py` — SQLAlchemy ORM models with declarative base
  - `schemas.py` — Pydantic validation schemas (Base, Create, Read, Update variants)
  - `routers/` — One APIRouter per resource (macros, commands, macro_groups, arr_instances, script_runs, schedules, agent)
  - `database.py` — SQLAlchemy engine and session factory
  - `utils/` — Utility modules (scheduler, arr_config, etc.)
  - `main.py` — FastAPI app initialization, lifespan handlers, router registration

### Naming Conventions
- **Models**: PascalCase for class names (e.g., `MacroGroup`, `Command`, `ScriptRun`)
- **Database tables**: snake_case (e.g., `macro_group`, `command_argument`, `script_run`)
- **Functions**: snake_case (e.g., `create_macro`, `get_macros`, `update_macro`)
- **Route prefixes**: plural kebab-case or snake_case (e.g., `/macros`, `/macro-groups`, `/arr-instances`)
- **Path parameters**: snake_case IDs (e.g., `/{id}`, `/{arg_id}`)

### Database Patterns

#### SQLAlchemy Conventions
- Use declarative base with `DeclarativeBase` and metadata naming convention:
  ```python
  naming_convention = {
      "ix": "ix_%(column_0_label)s",
      "uq": "uq_%(table_name)s_%(column_0_name)s",
      "ck": "ck_%(table_name)s_%(constraint_name)s",
      "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
      "pk": "pk_%(table_name)s"
  }
  ```
- Use `Mapped` type hints for all columns (modern SQLAlchemy 2.0+ style)
- Use `mapped_column()` with explicit type annotations
- Use `relationship()` with `back_populates` for bidirectional relationships
- Use `cascade="all, delete-orphan"` for child relationships to ensure data integrity

#### Alembic Migration Pattern
- Migrations are auto-generated with `alembic revision --autogenerate -m "description"`
- Migration files follow naming: `{revision_id}_{description}.py`
- Located in `backend/migrations/versions/`
- Always use `upgrade()` and `downgrade()` functions

### API Router Patterns

#### Standard CRUD Endpoints
All routers follow this RESTful pattern:

```python
@router.post("", response_model=TypeRead)
def create_resource(payload: TypeCreate, session: Session = Depends(get_session)):
    # Create new record
    
@router.get("", response_model=List[TypeRead])
def get_resources(session: Session = Depends(get_session)):
    # List all, typically ordered by 'ord' field
    
@router.get("/{id}", response_model=TypeRead)
def get_resource(id: int, session: Session = Depends(get_session)):
    # Get single resource by ID
    
@router.patch("/{id}", response_model=TypeRead)
def update_resource(id: int, payload: TypeUpdate, session: Session = Depends(get_session)):
    # Partial update using patch (exclude_unset=True pattern)
    
@router.delete("/{id}")
def delete_resource(id: int, session: Session = Depends(get_session)):
    # Delete resource
```

#### Error Handling
- Use `HTTPException(status_code=404, detail="Resource not found")` for not-found errors
- Use `HTTPException(status_code=500, detail="Error message")` for server errors
- Return error message strings in `detail` field

#### Partial Updates Pattern
```python
update_data = payload.model_dump(exclude_unset=True)
for key, value in update_data.items():
    setattr(resource, key, value)
```

### Pydantic Schema Patterns

#### Three-Variant Schema Pattern
For each resource, create three schema classes:
1. **Base** — Common fields shared across operations
2. **Create** — For POST requests (inherits from Base)
3. **Update** — For PATCH requests (all fields Optional)
4. **Read** — For responses, includes ID and relationships (with `ConfigDict(from_attributes=True)`)

Example:
```python
class MacroBase(BaseModel):
    name: str
    ord: int = 0
    macro_group_id: Optional[int] = None

class MacroCreate(MacroBase):
    pass

class MacroUpdate(BaseModel):
    name: Optional[str] = None
    ord: Optional[int] = None
    macro_group_id: Optional[int] = None

class MacroRead(MacroBase):
    id: int
    commands: List[CommandRead] = []
    model_config = ConfigDict(from_attributes=True)
```

### Session & Dependency Injection
- Use `get_session()` dependency to inject database session into route handlers
- Session is yielded and automatically closed in finally block
- In tests, override `get_session` with in-memory test session

---

## TypeScript/React Frontend Conventions

### Project Structure
- **`app/`** — Next.js App Router pages and layouts
- **`app/components/`** — Reusable React components
- **`app/context/`** — React Context providers (TerminalContext, MacroContext)
- **`app/[feature]/page.tsx`** — Route-specific pages (admin, scheduler, chat, scraper, etc.)
- **`design/`** — Design system reference (colors, typography, components)

### Component Patterns

#### Functional Components with 'use client'
All interactive components use Client Components:
```tsx
'use client';
import React from 'react';

export default function ComponentName({ prop1, prop2 = 'default' }: ComponentProps) {
  // Logic
  return <div>...</div>;
}
```

#### Component Props Pattern
```tsx
interface ComponentProps {
  className?: string;
  environment?: string;
  dockerTag?: string;
  [otherProp]: Type;
}

export default function Component({ 
  className = '', 
  environment = 'Local', 
  dockerTag = 'dev' 
}: ComponentProps) {
  // ...
}
```

### Context Usage

#### Provider Pattern
Contexts are defined with:
1. **Type interface** (e.g., `TerminalContextType`)
2. **Context creation** with `createContext<T | undefined>(undefined)`
3. **Provider component** that manages state
4. **Custom hook** `useContext()` for consumption

Example:
```tsx
interface TerminalContextType {
  lines: string[];
  status: 'connected' | 'disconnected' | 'connecting';
  clearLines: () => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<string[]>([]);
  // ...
  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (!context) throw new Error('useTerminal must be used within TerminalProvider');
  return context;
}
```

#### Root Layout Integration
Root layout wraps children with multiple providers:
```tsx
<TerminalProvider>
  <MacroProvider>
    <Navigation>
      {children}
    </Navigation>
  </MacroProvider>
</TerminalProvider>
```

### State Management
- **Simple state**: `useState` for local component state
- **Shared state**: React Context for cross-component data
- **Async data**: Custom hooks that manage fetch state internally
- **WebSocket**: Context manages connection lifecycle (onopen, onmessage, onerror)

### Styling Conventions

#### Tailwind Classes
- Use design system color tokens: `bg-surface`, `text-on-surface`, `border-outline-variant`
- Use spacing scale: gap, p, m with standard values
- Use flexbox utilities for layout: `flex`, `flex-col`, `items-center`, `justify-between`
- State variants: `hover:`, `focus:`, `disabled:`, `animate-` prefixes

#### Class Organization Pattern
```tsx
className={`flex flex-col h-full bg-surface-container-lowest text-on-surface font-mono text-sm overflow-hidden border border-outline-variant ${className}`}
```

#### Responsive Design
- Use `lg:` prefix for larger screens (e.g., `lg:p-6`)
- Mobile-first approach (no prefix = mobile, `lg:` = desktop)

### Naming Conventions
- **Components**: PascalCase file names and export names (e.g., `Terminal.tsx`)
- **Contexts**: PascalCase with "Context" suffix (e.g., `TerminalContext.tsx`)
- **Hooks**: camelCase with "use" prefix (e.g., `useTerminal`)
- **Types/Interfaces**: PascalCase (e.g., `TerminalContextType`, `TerminalFeedItem`)

---

## API Design Conventions

### URL Patterns
- **Resource endpoints**: `/api/{resource}` (plural, kebab-case or snake_case)
- **Single resource**: `/api/{resource}/{id}`
- **Nested resources**: `/api/{parent}/{id}/{child}` (e.g., `/api/commands/{id}/arguments`)
- **Actions**: `/api/{resource}/{id}/action` (e.g., `/api/macros/{id}/execute`)
- **WebSocket**: `/ws/terminal`

### HTTP Methods
- `POST` — Create new resource
- `GET` — Read resource(s)
- `PATCH` — Partial update (not PUT)
- `DELETE` — Remove resource

### Response Format

#### Success Responses
- **Single resource**: Return the resource object directly
- **List**: Return array of resource objects
- **Action result**: Return object with status message or result

```json
{
  "id": 1,
  "name": "Example",
  "status": "success",
  "message": "Operation completed"
}
```

#### Error Responses
- Use `HTTPException` with `status_code` and `detail` fields
- Always include a `detail` string describing the error
- Standard codes: 404 (not found), 500 (server error), 400 (bad request)

```python
raise HTTPException(status_code=404, detail="Macro not found")
raise HTTPException(status_code=500, detail="Failed to send reset command: {str(e)}")
```

### WebSocket Messaging Format
Messages are JSON with status and payload:
```json
{
  "status": "started|streaming|completed|error|reset",
  "command": "shell command",
  "message": "output line",
  "error": "error message",
  "exit_code": 0,
  "run_id": "uuid",
  "macro_name": "name",
  "is_last": true
}
```

---

## Design System Rules

### Colors
All colors are defined in `frontend/design/code.html` Tailwind config as custom tokens:
- **Primary**: `primary`, `on-primary`, `primary-container`, `on-primary-container`, `primary-fixed`, `primary-fixed-dim`, `on-primary-fixed`, `on-primary-fixed-variant`
- **Secondary**: `secondary`, `on-secondary`, `secondary-container`, `on-secondary-container`, `secondary-fixed`, `secondary-fixed-dim`
- **Tertiary**: `tertiary`, `on-tertiary`, `tertiary-container`, `on-tertiary-container`, `tertiary-fixed`, `tertiary-fixed-dim`
- **Error**: `error`, `on-error`, `error-container`, `on-error-container`
- **Surface variants**: `surface`, `surface-dim`, `surface-bright`, `surface-container`, `surface-container-low`, `surface-container-high`, `surface-container-highest`, `surface-container-lowest`
- **Text**: `on-surface`, `on-surface-variant`, `on-background`
- **Outline**: `outline`, `outline-variant`

### Typography
Fonts are defined in `frontend/design/code.html`:
- **Headline**: Space Grotesk (font-headline) — titles and headers
- **Body**: Inter (font-body) — main text
- **Label**: Space Grotesk (font-label) — labels and captions
- **Monospace**: JetBrains Mono (font-mono) — code, terminal output

### Special Components
- **Glass panel**: `.glass-panel { background: rgba(53, 53, 52, 0.6); backdrop-filter: blur(20px); }`
- **Kinetic gradient**: `.kinetic-gradient { background: linear-gradient(90deg, #00E38A 0%, #00FF9C 100%); }`

### Layout Patterns
- **Terminal**: `flex flex-col h-full bg-surface-container-lowest overflow-hidden border border-outline-variant`
- **Header**: `flex items-center px-4 py-2 bg-surface-container-low border-b border-outline-variant`
- **Content area**: `flex-1 p-4 overflow-y-auto`

---

## Docker & Deployment Conventions

### Service Configuration
Services are containerized with:
- **Backend**: Python 3.11-slim, Uvicorn on port 8080
- **Frontend**: Node 20-alpine, Next.js on port 3000 (multi-stage build)
- **Agent**: Python-based worker (no exposed port)
- **Database**: PostgreSQL 15 on port 5432
- **Cache**: Redis 7 on port 6379

### Docker Compose Patterns
- Development images use `Dockerfile.dev` for live reload
- Production images use `Dockerfile` (multi-stage builds for frontend)
- Volumes mount source code for hot-reload in dev
- Environment variables passed via .env file
- Service dependencies declared with `depends_on`

### Build System
- Makefile targets: `make dev`, `make run`, `make test`, `make build-all`, `make push-all`
- Docker images tagged: `eugenekallis/servertoolpython-{service}:{VERSION}`
- Build command: `docker build --platform linux/amd64 -t IMAGE:TAG`

### CI/CD Pipeline (Woodpecker)
- **Trigger**: On push to `develop` branch or manual trigger
- **Steps**: Build and push each service separately (backend, frontend, agent, scraper, arr-searcher, magnet-bridge)
- **Images**: Use `plugins/docker` with `daemon_off: true` for host socket mounting
- **Secrets**: Docker credentials from Woodpecker secret store

### Kubernetes Deployment
- Helm charts in `../kubernetes-cluster/charts/servertool-python`
- Deploy command: `make helm-deploy`
- Separate dev and prod deploy pipelines in `.woodpecker/`

---

## Git Workflow

### Branch Conventions
- **Main branch**: `main` — production code only
- **Development branch**: `develop` — active development, pull requests merge here
- Always work on `develop`, never directly on `main`
- User manually merges `develop` → `main` when ready for release

### Commit Message Format
Commits follow conventional format:
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — build, dependencies, tooling
- `docs:` — documentation updates
- `refactor:` — code refactoring without behavior change

Examples from history:
```
feat: Add file attachment functionality to ChatTerminal component
fix: Restore mobile sidebar toggle with minimal top bar
chore: Switch from `npm ci` to `npm install` for dependency installation
docs: Update CLAUDE.md with memory and git workflow sections
```

