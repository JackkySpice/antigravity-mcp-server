import { z } from "zod";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ============================================================================
// Schema Definitions
// ============================================================================

export const SaveKnowledgeInputSchema = z.object({
  title: z.string().describe("Knowledge item title"),
  content: z.string().describe("The knowledge content"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  scope: z
    .enum(["global", "project"])
    .optional()
    .default("global")
    .describe("Scope of the knowledge item"),
  projectPath: z
    .string()
    .optional()
    .describe("For project-scoped items, the project path"),
});

export const SearchKnowledgeInputSchema = z.object({
  query: z.string().describe("Search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  scope: z
    .enum(["global", "project", "all"])
    .optional()
    .default("all")
    .describe("Scope to search within"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results to return"),
});

export type SaveKnowledgeInput = z.infer<typeof SaveKnowledgeInputSchema>;
export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInputSchema>;

// ============================================================================
// Interfaces
// ============================================================================

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  scope: "global" | "project";
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeIndex {
  items: Record<string, KnowledgeItem>;
  lastUpdated: string;
}

interface SearchResult {
  item: KnowledgeItem;
  score: number;
}

// ============================================================================
// Tool Definitions for MCP SDK
// ============================================================================

export const saveKnowledgeTool = {
  name: "save_knowledge",
  description:
    "Saves a knowledge item for future reference. Knowledge can be global or project-scoped, and tagged for easy retrieval.",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Knowledge item title",
      },
      content: {
        type: "string",
        description: "The knowledge content",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for categorization",
      },
      scope: {
        type: "string",
        enum: ["global", "project"],
        description: "Scope of the knowledge item (default: global)",
      },
      projectPath: {
        type: "string",
        description: "For project-scoped items, the project path",
      },
    },
    required: ["title", "content"],
  },
};

export const searchKnowledgeTool = {
  name: "search_knowledge",
  description:
    "Searches saved knowledge items by query text and optional filters. Returns matching items sorted by relevance.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Filter by tags",
      },
      scope: {
        type: "string",
        enum: ["global", "project", "all"],
        description: "Scope to search within (default: all)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
      },
    },
    required: ["query"],
  },
};

// Storage Helpers - matches AntiGravity's ~/.gemini/antigravity/ structure
// ============================================================================

const KNOWLEDGE_DIR = join(homedir(), ".gemini", "antigravity", "knowledge");
const INDEX_FILE = join(KNOWLEDGE_DIR, "index.json");

async function ensureKnowledgeDir(): Promise<void> {
  try {
    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

async function loadIndex(): Promise<KnowledgeIndex> {
  try {
    const content = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(content) as KnowledgeIndex;
  } catch {
    return {
      items: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveIndex(index: KnowledgeIndex): Promise<void> {
  await ensureKnowledgeDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
}

async function saveKnowledgeFile(item: KnowledgeItem): Promise<void> {
  await ensureKnowledgeDir();
  const filePath = join(KNOWLEDGE_DIR, `${item.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(item, null, 2), "utf-8");
}

async function loadKnowledgeFile(id: string): Promise<KnowledgeItem | null> {
  try {
    const filePath = join(KNOWLEDGE_DIR, `${id}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as KnowledgeItem;
  } catch {
    return null;
  }
}

// ============================================================================
// Search Helpers
// ============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function calculateRelevanceScore(
  item: KnowledgeItem,
  queryTokens: string[]
): number {
  const titleTokens = tokenize(item.title);
  const contentTokens = tokenize(item.content);
  const tagTokens = item.tags.map((t) => t.toLowerCase());

  let score = 0;

  for (const queryToken of queryTokens) {
    // Title matches (highest weight)
    for (const titleToken of titleTokens) {
      if (titleToken === queryToken) {
        score += 10;
      } else if (titleToken.includes(queryToken)) {
        score += 5;
      }
    }

    // Tag matches (high weight)
    for (const tagToken of tagTokens) {
      if (tagToken === queryToken) {
        score += 8;
      } else if (tagToken.includes(queryToken)) {
        score += 4;
      }
    }

    // Content matches (lower weight)
    for (const contentToken of contentTokens) {
      if (contentToken === queryToken) {
        score += 2;
      } else if (contentToken.includes(queryToken)) {
        score += 1;
      }
    }
  }

  return score;
}

function filterByScope(
  item: KnowledgeItem,
  scope: "global" | "project" | "all",
  projectPath?: string
): boolean {
  if (scope === "all") {
    return true;
  }

  if (scope === "global") {
    return item.scope === "global";
  }

  if (scope === "project") {
    if (!projectPath) {
      return item.scope === "project";
    }
    return item.scope === "project" && item.projectPath === projectPath;
  }

  return true;
}

function filterByTags(item: KnowledgeItem, tags?: string[]): boolean {
  if (!tags || tags.length === 0) {
    return true;
  }

  const itemTagsLower = item.tags.map((t) => t.toLowerCase());
  return tags.some((tag) => itemTagsLower.includes(tag.toLowerCase()));
}

// ============================================================================
// Handler Functions
// ============================================================================

export async function handleSaveKnowledge(
  input: SaveKnowledgeInput
): Promise<string> {
  const timestamp = new Date().toISOString();
  const id = randomUUID();

  const item: KnowledgeItem = {
    id,
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    scope: input.scope ?? "global",
    projectPath: input.projectPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // Save the individual knowledge file
  await saveKnowledgeFile(item);

  // Update the index
  const index = await loadIndex();
  index.items[id] = {
    ...item,
    content: item.content.substring(0, 200), // Store truncated content in index
  };
  index.lastUpdated = timestamp;
  await saveIndex(index);

  const lines: string[] = [
    `✓ Knowledge saved`,
    `  ID: ${id}`,
    `  Title: ${input.title}`,
    `  Scope: ${item.scope}`,
  ];

  if (item.tags.length > 0) {
    lines.push(`  Tags: ${item.tags.join(", ")}`);
  }

  if (item.projectPath) {
    lines.push(`  Project: ${item.projectPath}`);
  }

  lines.push(`  Saved to: ${KNOWLEDGE_DIR}`);

  return lines.join("\n");
}

export async function handleSearchKnowledge(
  input: SearchKnowledgeInput
): Promise<string> {
  const index = await loadIndex();
  const queryTokens = tokenize(input.query);
  const limit = input.limit ?? 10;
  const scope = input.scope ?? "all";

  const results: SearchResult[] = [];

  for (const [id, indexedItem] of Object.entries(index.items)) {
    // Load full item for accurate scoring
    const fullItem = await loadKnowledgeFile(id);
    if (!fullItem) {
      continue;
    }

    // Apply filters
    if (!filterByScope(fullItem, scope)) {
      continue;
    }

    if (!filterByTags(fullItem, input.tags)) {
      continue;
    }

    // Calculate relevance score
    const score = calculateRelevanceScore(fullItem, queryTokens);

    if (score > 0) {
      results.push({ item: fullItem, score });
    }
  }

  // Sort by relevance score (descending)
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  const limitedResults = results.slice(0, limit);

  if (limitedResults.length === 0) {
    return `No knowledge items found matching "${input.query}"`;
  }

  const lines: string[] = [
    `Found ${limitedResults.length} knowledge item(s) matching "${input.query}":`,
    "",
  ];

  for (const { item, score } of limitedResults) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📄 ${item.title}`);
    lines.push(`   ID: ${item.id}`);
    lines.push(`   Scope: ${item.scope}`);

    if (item.tags.length > 0) {
      lines.push(`   Tags: ${item.tags.join(", ")}`);
    }

    if (item.projectPath) {
      lines.push(`   Project: ${item.projectPath}`);
    }

    lines.push(`   Created: ${item.createdAt}`);
    lines.push(`   Relevance: ${score}`);
    lines.push("");

    // Show content preview (first 300 chars)
    const preview =
      item.content.length > 300
        ? item.content.substring(0, 300) + "..."
        : item.content;
    lines.push(`   ${preview.replace(/\n/g, "\n   ")}`);
    lines.push("");
  }

  return lines.join("\n");
}
