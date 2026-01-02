import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// State interfaces
interface ModeChange {
  from: string | null;
  to: string;
  timestamp: string;
}

interface TaskState {
  taskName: string;
  mode: string;
  taskStatus: string;
  taskSummary?: string;
  predictedTaskSize?: number;
  createdAt: string;
  updatedAt: string;
  modeHistory: ModeChange[];
}

interface AntiGravityState {
  currentTask: TaskState | null;
  lastUpdated: string;
}

// Tool definition for MCP SDK
export const taskBoundaryTool = {
  name: "task_boundary",
  description:
    "Marks task boundaries and tracks task state transitions. Use this to signal when entering PLANNING, EXECUTION, or VERIFICATION phases of a task.",
  inputSchema: {
    type: "object" as const,
    properties: {
      TaskName: {
        type: "string",
        description: "Human readable task name",
      },
      Mode: {
        type: "string",
        enum: ["PLANNING", "EXECUTION", "VERIFICATION"],
        description: "Current task mode",
      },
      TaskStatus: {
        type: "string",
        description: "Current/next action description",
      },
      TaskSummary: {
        type: "string",
        description: "Summary of accomplishments",
      },
      PredictedTaskSize: {
        type: "number",
        description: "Estimated tool calls needed",
      },
    },
    required: ["TaskName", "Mode", "TaskStatus"],
  },
};

// State file path
const STATE_DIR = join(homedir(), ".antigravity");
const STATE_FILE = join(STATE_DIR, "state.json");

async function ensureStateDir(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

async function loadState(): Promise<AntiGravityState> {
  try {
    const content = await fs.readFile(STATE_FILE, "utf-8");
    return JSON.parse(content) as AntiGravityState;
  } catch {
    return {
      currentTask: null,
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveState(state: AntiGravityState): Promise<void> {
  await ensureStateDir();
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// Main handler function
export async function handleTaskBoundary(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  // Validate required fields
  const TaskName = args.TaskName as string | undefined;
  const Mode = args.Mode as string | undefined;
  const TaskStatus = args.TaskStatus as string | undefined;
  const TaskSummary = args.TaskSummary as string | undefined;
  const PredictedTaskSize = args.PredictedTaskSize as number | undefined;

  if (!TaskName || typeof TaskName !== "string") {
    return {
      content: [{ type: "text", text: "Error: TaskName is required and must be a string" }],
      isError: true,
    };
  }

  if (!Mode || !["PLANNING", "EXECUTION", "VERIFICATION"].includes(Mode)) {
    return {
      content: [{ type: "text", text: "Error: Mode is required and must be PLANNING, EXECUTION, or VERIFICATION" }],
      isError: true,
    };
  }

  if (!TaskStatus || typeof TaskStatus !== "string") {
    return {
      content: [{ type: "text", text: "Error: TaskStatus is required and must be a string" }],
      isError: true,
    };
  }

  const timestamp = new Date().toISOString();
  const state = await loadState();

  const previousMode = state.currentTask?.mode ?? null;

  // Build mode history
  const modeHistory: ModeChange[] = state.currentTask?.modeHistory ?? [];

  // Track mode change if different
  if (previousMode !== Mode) {
    modeHistory.push({
      from: previousMode,
      to: Mode,
      timestamp,
    });
  }

  // Update current task state
  const taskState: TaskState = {
    taskName: TaskName,
    mode: Mode,
    taskStatus: TaskStatus,
    taskSummary: TaskSummary,
    predictedTaskSize: PredictedTaskSize,
    createdAt: state.currentTask?.createdAt ?? timestamp,
    updatedAt: timestamp,
    modeHistory,
  };

  const newState: AntiGravityState = {
    currentTask: taskState,
    lastUpdated: timestamp,
  };

  await saveState(newState);

  // Build confirmation message
  const lines: string[] = [
    `✓ Task Boundary: ${Mode}`,
    `  Task: ${TaskName}`,
    `  Status: ${TaskStatus}`,
  ];

  if (TaskSummary) {
    lines.push(`  Summary: ${TaskSummary}`);
  }

  if (PredictedTaskSize !== undefined) {
    lines.push(`  Predicted Size: ${PredictedTaskSize} tool calls`);
  }

  if (previousMode && previousMode !== Mode) {
    lines.push(`  Mode Transition: ${previousMode} → ${Mode}`);
  }

  lines.push(`  Timestamp: ${timestamp}`);
  lines.push(`  State saved to: ${STATE_FILE}`);

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
