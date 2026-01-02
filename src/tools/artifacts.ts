import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";

// Types
type ArtifactType = "implementation_plan" | "task" | "walkthrough" | "other";

interface ArtifactMetadata {
  type: ArtifactType;
  summary?: string;
  complexity?: number;
  isArtifact: boolean;
  createdAt: string;
  updatedAt: string;
  versions: Array<{
    timestamp: string;
    hash: string;
  }>;
}

interface ArtifactsManifest {
  projectPath: string;
  projectHash: string;
  artifacts: Record<string, ArtifactMetadata>;
}

// Utility functions - matches AntiGravity's ~/.gemini/antigravity/brain/{uuid}/ structure
function getProjectHash(projectPath: string): string {
  return crypto.createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
}

function getBrainDir(projectPath: string): string {
  const projectHash = getProjectHash(projectPath);
  return path.join(os.homedir(), ".gemini", "antigravity", "brain", projectHash);
}

function getArtifactPath(brainDir: string, type: ArtifactType): string {
  return path.join(brainDir, `${type}.md`);
}

function getManifestPath(brainDir: string): string {
  return path.join(brainDir, "artifacts.json");
}

async function ensureBrainDir(brainDir: string): Promise<void> {
  await fs.mkdir(brainDir, { recursive: true });
}

async function loadManifest(brainDir: string, projectPath: string): Promise<ArtifactsManifest> {
  const manifestPath = getManifestPath(brainDir);
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content) as ArtifactsManifest;
  } catch {
    return {
      projectPath,
      projectHash: getProjectHash(projectPath),
      artifacts: {},
    };
  }
}

async function saveManifest(brainDir: string, manifest: ArtifactsManifest): Promise<void> {
  const manifestPath = getManifestPath(brainDir);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

function getContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
}

function computeDiffSummary(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const added = newLines.filter((line) => !oldLines.includes(line)).length;
  const removed = oldLines.filter((line) => !newLines.includes(line)).length;

  const parts: string[] = [];
  if (added > 0) parts.push(`+${added} lines`);
  if (removed > 0) parts.push(`-${removed} lines`);

  if (parts.length === 0) {
    return "No changes detected";
  }

  return parts.join(", ");
}

// Tool definitions
const createArtifactSchema = {
  type: z.enum(["implementation_plan", "task", "walkthrough", "other"]).describe("Artifact type"),
  content: z.string().describe("The artifact content (markdown)"),
  summary: z.string().optional().describe("Brief description of the artifact"),
  complexity: z.number().min(1).max(10).optional().describe("Complexity rating 1-10 for review importance"),
  isArtifact: z.boolean().optional().default(true).describe("Whether this is a user-facing artifact"),
  overwrite: z.boolean().optional().default(false).describe("Set true to overwrite existing artifact"),
  projectPath: z.string().optional().describe("Project directory path (defaults to cwd)"),
};

const updateArtifactSchema = {
  type: z.enum(["implementation_plan", "task", "walkthrough", "other"]).describe("Which artifact to update"),
  content: z.string().describe("New content for the artifact"),
  complexity: z.number().min(1).max(10).optional().describe("Updated complexity rating"),
  projectPath: z.string().optional().describe("Project directory path (defaults to cwd)"),
};

// Tool handlers
async function handleCreateArtifact(args: {
  type: ArtifactType;
  content: string;
  summary?: string;
  complexity?: number;
  isArtifact?: boolean;
  overwrite?: boolean;
  projectPath?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectPath = args.projectPath || process.cwd();
  const brainDir = getBrainDir(projectPath);

  await ensureBrainDir(brainDir);

  const artifactPath = getArtifactPath(brainDir, args.type);
  const manifest = await loadManifest(brainDir, projectPath);

  const now = new Date().toISOString();
  const contentHash = getContentHash(args.content);

  // Check if artifact already exists
  const existingArtifact = manifest.artifacts[args.type];
  if (existingArtifact && !args.overwrite) {
    return {
      content: [
        {
          type: "text",
          text: `Artifact "${args.type}" already exists. Use update_artifact to modify it, or set overwrite=true.\nPath: ${artifactPath}`,
        },
      ],
    };
  }

  // Write artifact content
  await fs.writeFile(artifactPath, args.content, "utf-8");

  // Update manifest
  manifest.artifacts[args.type] = {
    type: args.type,
    summary: args.summary,
    complexity: args.complexity,
    isArtifact: args.isArtifact ?? true,
    createdAt: existingArtifact?.createdAt ?? now,
    updatedAt: now,
    versions: existingArtifact?.versions
      ? [...existingArtifact.versions, { timestamp: now, hash: contentHash }]
      : [{ timestamp: now, hash: contentHash }],
  };

  await saveManifest(brainDir, manifest);

  return {
    content: [
      {
        type: "text",
        text: [
          `${args.overwrite && existingArtifact ? "Overwrote" : "Created"} artifact: ${args.type}`,
          `Path: ${artifactPath}`,
          `Hash: ${contentHash}`,
          args.summary ? `Summary: ${args.summary}` : null,
          args.complexity ? `Complexity: ${args.complexity}/10` : null,
          `IsArtifact: ${args.isArtifact ?? true}`,
          `Project hash: ${getProjectHash(projectPath)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  };
}

async function handleUpdateArtifact(args: {
  type: ArtifactType;
  content: string;
  projectPath?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectPath = args.projectPath || process.cwd();
  const brainDir = getBrainDir(projectPath);
  const artifactPath = getArtifactPath(brainDir, args.type);
  const manifest = await loadManifest(brainDir, projectPath);

  // Check if artifact exists
  const existingArtifact = manifest.artifacts[args.type];
  if (!existingArtifact) {
    return {
      content: [
        {
          type: "text",
          text: `Artifact "${args.type}" does not exist. Use create_artifact to create it first.`,
        },
      ],
    };
  }

  // Read old content for diff
  let oldContent = "";
  try {
    oldContent = await fs.readFile(artifactPath, "utf-8");
  } catch {
    // File might have been deleted manually
  }

  const now = new Date().toISOString();
  const contentHash = getContentHash(args.content);

  // Check if content is the same
  const lastVersion = existingArtifact.versions[existingArtifact.versions.length - 1];
  if (lastVersion && lastVersion.hash === contentHash) {
    return {
      content: [
        {
          type: "text",
          text: `No changes detected. Artifact "${args.type}" content is identical to the current version.`,
        },
      ],
    };
  }

  // Write new content
  await fs.writeFile(artifactPath, args.content, "utf-8");

  // Update manifest with version history
  existingArtifact.updatedAt = now;
  existingArtifact.versions.push({
    timestamp: now,
    hash: contentHash,
  });

  await saveManifest(brainDir, manifest);

  const diffSummary = computeDiffSummary(oldContent, args.content);

  return {
    content: [
      {
        type: "text",
        text: [
          `Updated artifact: ${args.type}`,
          `Path: ${artifactPath}`,
          `Hash: ${contentHash}`,
          `Version: ${existingArtifact.versions.length}`,
          `Changes: ${diffSummary}`,
        ].join("\n"),
      },
    ],
  };
}

// Register tools with MCP server
export function registerArtifactTools(server: McpServer): void {
  server.tool(
    "create_artifact",
    "Create a new artifact in the AntiGravity brain storage. Artifacts persist project-specific information like implementation plans, tasks, and walkthroughs.",
    createArtifactSchema,
    handleCreateArtifact
  );

  server.tool(
    "update_artifact",
    "Update an existing artifact with new content. Maintains version history and returns a diff summary.",
    updateArtifactSchema,
    handleUpdateArtifact
  );
}

// Export individual handlers for testing
export { handleCreateArtifact, handleUpdateArtifact };

// Export types
export type { ArtifactType, ArtifactMetadata, ArtifactsManifest };
