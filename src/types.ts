/**
 * Memory entry categories
 */
export type MemoryCategory =
  | 'architecture'      // System architecture decisions
  | 'pattern'           // Code patterns and conventions
  | 'decision'          // Technical decisions with rationale
  | 'dependency'        // Dependency choices and constraints
  | 'convention'        // Naming, formatting, style rules
  | 'bug'              // Known bugs and workarounds
  | 'context'          // Project context and domain knowledge
  | 'todo'             // Planned improvements
  | 'relationship';    // File/module relationships

/**
 * A single memory entry
 */
export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  tags: string[];
  filePaths: string[];        // Related files
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  importance: number;          // 1-10 scale
  source: 'user' | 'auto';   // How it was created
}

/**
 * Input for creating a memory
 */
export interface CreateMemoryInput {
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  filePaths?: string[];
  importance?: number;
}

/**
 * Input for updating a memory
 */
export interface UpdateMemoryInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  filePaths?: string[];
  importance?: number;
  category?: MemoryCategory;
}

/**
 * Search/query options
 */
export interface QueryOptions {
  query?: string;              // Full-text search
  category?: MemoryCategory;
  tags?: string[];
  filePath?: string;           // Memories related to a file
  minImportance?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'recent' | 'importance' | 'accessed';
}

/**
 * Project summary generated from memories
 */
export interface ProjectSummary {
  totalMemories: number;
  byCategory: Record<MemoryCategory, number>;
  topTags: Array<{ tag: string; count: number }>;
  recentlyUpdated: MemoryEntry[];
  mostAccessed: MemoryEntry[];
  highImportance: MemoryEntry[];
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  path: string;                // Path to SQLite database file
  walMode?: boolean;           // Enable WAL mode (default: true)
}

/**
 * Server configuration
 */
export interface ServerConfig {
  database: DatabaseConfig;
  projectRoot?: string;        // Root directory of the project
  autoIndex?: boolean;         // Auto-index file structure
  maxMemories?: number;        // Max memories to store (default: 10000)
}
