import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryDatabase } from './database.js';
import { ServerConfig, CreateMemoryInput, UpdateMemoryInput, QueryOptions, MemoryCategory } from './types.js';

const VALID_CATEGORIES: MemoryCategory[] = [
  'architecture', 'pattern', 'decision', 'dependency',
  'convention', 'bug', 'context', 'todo', 'relationship',
];

export function createServer(config: ServerConfig): Server {
  const db = new MemoryDatabase(config.database);

  const server = new Server(
    { name: 'codebase-memory', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ---- List Tools ----
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'remember',
        description: 'Store a new memory about the codebase — architecture decisions, patterns, conventions, bugs, or context. The AI agent calls this to save knowledge for future sessions.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            category: { type: 'string', enum: VALID_CATEGORIES, description: 'Memory category' },
            title: { type: 'string', description: 'Short descriptive title' },
            content: { type: 'string', description: 'Detailed content of the memory' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
            filePaths: { type: 'array', items: { type: 'string' }, description: 'Related file paths' },
            importance: { type: 'number', minimum: 1, maximum: 10, description: 'Importance 1-10 (default: 5)' },
          },
          required: ['category', 'title', 'content'],
        },
      },
      {
        name: 'recall',
        description: 'Search and retrieve memories. Use natural language queries, filter by category, tags, or file paths. Returns the most relevant memories for the current task.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Natural language search query' },
            category: { type: 'string', enum: VALID_CATEGORIES, description: 'Filter by category' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
            filePath: { type: 'string', description: 'Find memories related to a file' },
            minImportance: { type: 'number', description: 'Minimum importance threshold' },
            limit: { type: 'number', description: 'Max results (default: 20)' },
          },
        },
      },
      {
        name: 'update_memory',
        description: 'Update an existing memory entry. Provide the memory ID and fields to change.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            id: { type: 'string', description: 'Memory ID to update' },
            title: { type: 'string', description: 'New title' },
            content: { type: 'string', description: 'New content' },
            category: { type: 'string', enum: VALID_CATEGORIES, description: 'New category' },
            tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
            filePaths: { type: 'array', items: { type: 'string' }, description: 'New file paths' },
            importance: { type: 'number', minimum: 1, maximum: 10, description: 'New importance' },
          },
          required: ['id'],
        },
      },
      {
        name: 'forget',
        description: 'Delete a memory by ID. Use when information is outdated or incorrect.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            id: { type: 'string', description: 'Memory ID to delete' },
          },
          required: ['id'],
        },
      },
      {
        name: 'project_summary',
        description: 'Get an overview of all stored memories — counts by category, top tags, recent updates, and high-importance entries. Call this at the start of a session to load context.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
    ],
  }));

  // ---- Call Tool ----
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'remember': {
        const input = args as unknown as CreateMemoryInput;
        const entry = db.create(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, memory: entry }, null, 2),
          }],
        };
      }

      case 'recall': {
        const options = args as unknown as QueryOptions;
        const results = db.query(options);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ count: results.length, memories: results }, null, 2),
          }],
        };
      }

      case 'update_memory': {
        const input = args as unknown as UpdateMemoryInput;
        const updated = db.update(input);
        if (!updated) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Memory not found' }) }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, memory: updated }, null, 2),
          }],
        };
      }

      case 'forget': {
        const { id } = args as { id: string };
        const deleted = db.delete(id);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: deleted, id }),
          }],
        };
      }

      case 'project_summary': {
        const summary = db.getSummary();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  // ---- Resources ----
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'memory://summary',
        name: 'Project Memory Summary',
        description: 'Overview of all stored codebase memories',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === 'memory://summary') {
      const summary = db.getSummary();
      return {
        contents: [{
          uri: 'memory://summary',
          mimeType: 'application/json',
          text: JSON.stringify(summary, null, 2),
        }],
      };
    }
    throw new Error(`Unknown resource: ${request.params.uri}`);
  });

  // Cleanup on close
  const originalClose = server.close.bind(server);
  server.close = async () => {
    db.close();
    await originalClose();
  };

  return server;
}

export async function startServer(config: ServerConfig): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
