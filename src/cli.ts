#!/usr/bin/env node

import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { startServer } from './server.js';
import { ServerConfig } from './types.js';

const VERSION = '1.0.0';

function printHelp(): void {
  console.error(`
codebase-memory v${VERSION}
MCP server that gives AI agents persistent memory of your codebase

USAGE:
  codebase-memory [options]

OPTIONS:
  --db <path>       SQLite database path (default: .codebase-memory/memory.db)
  --project <path>  Project root directory (default: current directory)
  --version         Show version
  --help, -h        Show this help

MCP CLIENT CONFIGURATION:

  Claude Desktop (claude_desktop_config.json):
  {
    "mcpServers": {
      "codebase-memory": {
        "command": "npx",
        "args": ["codebase-memory"]
      }
    }
  }

  Cursor (.cursor/mcp.json):
  {
    "mcpServers": {
      "codebase-memory": {
        "command": "npx",
        "args": ["codebase-memory"]
      }
    }
  }

  Custom database location:
  {
    "mcpServers": {
      "codebase-memory": {
        "command": "npx",
        "args": ["codebase-memory", "--db", "/path/to/memory.db"]
      }
    }
  }
`);
}

function parseArgs(args: string[]): { dbPath: string; projectRoot: string } {
  let dbPath = '.codebase-memory/memory.db';
  let projectRoot = process.cwd();

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--db':
        dbPath = args[++i] || dbPath;
        break;
      case '--project':
        projectRoot = args[++i] || projectRoot;
        break;
      case '--version':
        console.error(`codebase-memory v${VERSION}`);
        process.exit(0);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return { dbPath: resolve(dbPath), projectRoot: resolve(projectRoot) };
}

async function main(): Promise<void> {
  const { dbPath, projectRoot } = parseArgs(process.argv.slice(2));

  // Ensure database directory exists
  const dbDir = resolve(dbPath, '..');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const config: ServerConfig = {
    database: { path: dbPath },
    projectRoot,
  };

  console.error(`[codebase-memory] Starting MCP server...`);
  console.error(`[codebase-memory] Database: ${dbPath}`);
  console.error(`[codebase-memory] Project: ${projectRoot}`);

  await startServer(config);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
