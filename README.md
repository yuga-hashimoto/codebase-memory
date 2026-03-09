# codebase-memory

**Your AI agent forgets everything between sessions.** This MCP server fixes that.

```
You: "What architecture pattern does this project use?"

Without codebase-memory:
  AI: "I'd need to look through the codebase to determine that."

With codebase-memory:
  AI: "This project uses a hexagonal architecture with ports and adapters.
       The decision was made in March 2026 to improve testability.
       Related files: src/ports/, src/adapters/, src/domain/"
```

## The Problem

AI coding agents (Cursor, Claude, Copilot) lose all context between sessions:
- Architecture decisions get forgotten and re-asked
- Code patterns get violated because the AI doesn't know your conventions
- Bug workarounds get re-introduced after being fixed
- Every session starts from zero

**codebase-memory** gives your AI persistent memory through the Model Context Protocol (MCP).

## Quick Start

```bash
# Install
npm install -g codebase-memory

# Add to Claude Desktop config (~/.config/claude/claude_desktop_config.json)
{
  "mcpServers": {
    "codebase-memory": {
      "command": "npx",
      "args": ["codebase-memory"]
    }
  }
}
```

That's it. Your AI agent now has 5 memory tools:

| Tool | Description |
|------|-------------|
| `remember` | Store architecture decisions, patterns, conventions, bugs, context |
| `recall` | Search memories by query, category, tags, or file path |
| `update_memory` | Update existing memories when things change |
| `forget` | Delete outdated or incorrect memories |
| `project_summary` | Get overview of all memories (call at session start) |

## Memory Categories

| Category | Use For |
|----------|--------|
| `architecture` | System design decisions, service boundaries, data flow |
| `pattern` | Code patterns: repository, factory, observer, etc. |
| `decision` | Why choices were made ("We chose Postgres over MongoDB because...") |
| `dependency` | Package choices, version constraints, compatibility notes |
| `convention` | Naming rules, file structure, formatting standards |
| `bug` | Known bugs, workarounds, things that look wrong but aren't |
| `context` | Domain knowledge, business rules, user requirements |
| `todo` | Planned improvements, tech debt, future work |
| `relationship` | How files/modules connect, dependency graphs |

## How It Works

1. **AI stores knowledge** — As your agent learns about the codebase, it calls `remember` to save important information
2. **Persisted in SQLite** — Memories are stored locally in `.codebase-memory/memory.db`
3. **Retrieved on demand** — When the agent needs context, it calls `recall` with a search query
4. **Full-text search** — SQLite FTS5 enables fast, relevant search across all memories
5. **Importance scoring** — High-importance memories surface first

## Example Workflow

```
Session 1 (you're setting up the project):
  AI remembers:
  - "architecture: Monorepo with turborepo, apps/ for services, packages/ for shared"
  - "convention: All API routes use zod validation middleware"
  - "decision: Chose Drizzle ORM over Prisma for edge runtime support"
  - "bug: Don't use Date objects in API responses, use ISO strings (timezone issues)"

Session 2 (next day, different task):
  AI calls project_summary -> instantly knows the project structure
  AI calls recall({query: "API validation"}) -> knows to use zod middleware
  AI calls recall({filePath: "src/api/"}) -> gets all API-related memories
  -> Writes code that follows all your established patterns
```

## Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "codebase-memory": {
      "command": "npx",
      "args": ["codebase-memory"]
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "codebase-memory": {
      "command": "npx",
      "args": ["codebase-memory"]
    }
  }
}
```

### Custom Database Location

```json
{
  "mcpServers": {
    "codebase-memory": {
      "command": "npx",
      "args": ["codebase-memory", "--db", "/path/to/memory.db"]
    }
  }
}
```

## Programmatic API

```typescript
import { MemoryDatabase } from 'codebase-memory';

const db = new MemoryDatabase({ path: './memory.db' });

// Store a memory
const entry = db.create({
  category: 'architecture',
  title: 'Event-driven messaging',
  content: 'Services communicate via RabbitMQ. Orders service publishes OrderCreated events.',
  tags: ['messaging', 'rabbitmq'],
  filePaths: ['src/events/', 'src/services/orders/'],
  importance: 9,
});

// Search memories
const results = db.query({
  query: 'messaging',
  category: 'architecture',
  minImportance: 7,
});

// Get project overview
const summary = db.getSummary();
console.log(`Total memories: ${summary.totalMemories}`);
console.log(`Top tags: ${summary.topTags.map(t => t.tag).join(', ')}`);

db.close();
```

## Data Storage

- **Location:** `.codebase-memory/memory.db` (in your project root)
- **Format:** SQLite with FTS5 full-text search
- **Size:** Typically under 1MB for thousands of memories
- **Backup:** Just copy the `.db` file
- **Git:** Add `.codebase-memory/` to `.gitignore` (per-developer memories) or commit it (shared team knowledge)

## CLI Options

```
codebase-memory [options]

  --db <path>       SQLite database path (default: .codebase-memory/memory.db)
  --project <path>  Project root directory (default: cwd)
  --version         Show version
  --help            Show help
```

## License

MIT
