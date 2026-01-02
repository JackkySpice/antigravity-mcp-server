#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import tools
import { taskBoundaryTool, handleTaskBoundary } from "./tools/task_boundary.js";
import { notifyUserTool, handleNotifyUser } from "./tools/notify_user.js";
import { handleCreateArtifact, handleUpdateArtifact } from "./tools/artifacts.js";
import { 
  saveKnowledgeTool, 
  searchKnowledgeTool, 
  handleSaveKnowledge, 
  handleSearchKnowledge 
} from "./tools/knowledge.js";
import { 
  getAgentStateTool, 
  resetAgentStateTool,
  handleGetAgentState, 
  handleResetAgentState 
} from "./tools/agent_state.js";

const SERVER_NAME = "antigravity-mcp-server";
const SERVER_VERSION = "1.0.0";

// Tool definitions
const createArtifactTool = {
  name: "create_artifact",
  description: "Create a new artifact in the AntiGravity brain storage. Artifacts persist project-specific information like implementation plans, tasks, and walkthroughs.",
  inputSchema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: ["implementation_plan", "task", "walkthrough", "other"],
        description: "Artifact type",
      },
      content: {
        type: "string",
        description: "The artifact content (markdown)",
      },
      summary: {
        type: "string",
        description: "Brief description of the artifact",
      },
      complexity: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "Complexity rating 1-10 for review importance",
      },
      isArtifact: {
        type: "boolean",
        description: "Whether this is a user-facing artifact (default: true)",
      },
      overwrite: {
        type: "boolean",
        description: "Set true to overwrite existing artifact (default: false)",
      },
      projectPath: {
        type: "string",
        description: "Project directory path (defaults to cwd)",
      },
    },
    required: ["type", "content"],
  },
};

const updateArtifactTool = {
  name: "update_artifact",
  description: "Update an existing artifact with new content. Maintains version history and returns a diff summary.",
  inputSchema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: ["implementation_plan", "task", "walkthrough", "other"],
        description: "Which artifact to update",
      },
      content: {
        type: "string",
        description: "New content for the artifact",
      },
      complexity: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "Updated complexity rating",
      },
      projectPath: {
        type: "string",
        description: "Project directory path (defaults to cwd)",
      },
    },
    required: ["type", "content"],
  },
};

const tools = [
  taskBoundaryTool,
  notifyUserTool,
  createArtifactTool,
  updateArtifactTool,
  getAgentStateTool,
  resetAgentStateTool,
  saveKnowledgeTool,
  searchKnowledgeTool,
];

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

// Wrapper to convert string returns to proper format
function wrapHandler(
  handler: (args: any) => Promise<string | { content: Array<{ type: string; text: string }>; isError?: boolean }>
): ToolHandler {
  return async (args: Record<string, unknown>) => {
    const result = await handler(args);
    if (typeof result === "string") {
      return {
        content: [{ type: "text", text: result }],
      };
    }
    return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
  };
}

const toolHandlers: Record<string, ToolHandler> = {
  task_boundary: handleTaskBoundary as ToolHandler,
  notify_user: handleNotifyUser as ToolHandler,
  create_artifact: wrapHandler(handleCreateArtifact),
  update_artifact: wrapHandler(handleUpdateArtifact),
  get_agent_state: wrapHandler(handleGetAgentState),
  reset_agent_state: wrapHandler(handleResetAgentState),
  save_knowledge: wrapHandler(handleSaveKnowledge),
  search_knowledge: wrapHandler(handleSearchKnowledge),
};

async function main(): Promise<void> {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = toolHandlers[name];
    if (!handler) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }

    try {
      return await handler(args ?? {});
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing ${name}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.onerror = (error: Error) => {
    console.error("[MCP Server Error]", error);
  };

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
