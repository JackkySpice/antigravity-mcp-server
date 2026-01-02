import { z } from "zod";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Input schema definitions
export const GetAgentStateInputSchema = z.object({
  projectPath: z.string().optional().describe("Project to get state for"),
});

export const ResetAgentStateInputSchema = z.object({
  projectPath: z.string().optional().describe("Project to reset state for"),
  preserveStatistics: z.boolean().optional().describe("Keep statistics after reset"),
});

export type GetAgentStateInput = z.infer<typeof GetAgentStateInputSchema>;
export type ResetAgentStateInput = z.infer<typeof ResetAgentStateInputSchema>;

// State interfaces
type AgentMode = "PLANNING" | "EXECUTION" | "VERIFICATION" | "IDLE";

interface CurrentTask {
  name: string;
  status: string;
  summary?: string;
  startedAt: string;
}

interface RecentArtifact {
  type: "file" | "directory" | "commit" | "test" | "config";
  path: string;
  updatedAt: string;
}

interface ModeHistoryEntry {
  mode: AgentMode;
  timestamp: string;
  taskName?: string;
}

interface PendingReview {
  path: string;
  requestedAt: string;
}

interface SessionStatistics {
  toolCallsInSession: number;
  tasksCompleted: number;
  filesModified: number;
  testsRun: number;
  errorsEncountered: number;
  sessionStartedAt: string;
}

interface AgentState {
  currentMode: AgentMode;
  currentTask: CurrentTask | null;
  recentArtifacts: RecentArtifact[];
  modeHistory: ModeHistoryEntry[];
  pendingReviews: PendingReview[];
  statistics: SessionStatistics;
  projectPath?: string;
  lastUpdated: string;
}

interface TaskBoundaryState {
  currentTask: {
    taskName: string;
    mode: string;
    taskStatus: string;
    taskSummary?: string;
    createdAt: string;
    updatedAt: string;
    modeHistory: Array<{ from: string | null; to: string; timestamp: string }>;
  } | null;
  lastUpdated: string;
}

interface ArtifactsState {
  artifacts: RecentArtifact[];
}

interface ReviewsState {
  pendingReviews: PendingReview[];
}

interface StatisticsState {
  toolCallsInSession: number;
  tasksCompleted: number;
  filesModified: number;
  testsRun: number;
  errorsEncountered: number;
  sessionStartedAt: string;
}

// Tool definitions for MCP SDK
export const getAgentStateTool = {
  name: "get_agent_state",
  description:
    "Retrieves the current agent state including mode, task, artifacts, and statistics. Use this to understand the current context and what has been accomplished in the session.",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectPath: {
        type: "string",
        description: "Project to get state for",
      },
    },
    required: [],
  },
};

export const resetAgentStateTool = {
  name: "reset_agent_state",
  description:
    "Resets the agent state for a new session. Clears current task, mode history, artifacts, and optionally statistics.",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectPath: {
        type: "string",
        description: "Project to reset state for",
      },
      preserveStatistics: {
        type: "boolean",
        description: "Keep statistics after reset",
      },
    },
    required: [],
  },
};

// State file paths
const STATE_DIR = join(homedir(), ".antigravity");
const STATE_FILE = join(STATE_DIR, "state.json");
const ARTIFACTS_FILE = join(STATE_DIR, "artifacts.json");
const REVIEWS_FILE = join(STATE_DIR, "reviews.json");
const STATISTICS_FILE = join(STATE_DIR, "statistics.json");

const MAX_MODE_HISTORY = 10;
const MAX_RECENT_ARTIFACTS = 20;

async function ensureStateDir(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureStateDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function createDefaultStatistics(): SessionStatistics {
  return {
    toolCallsInSession: 0,
    tasksCompleted: 0,
    filesModified: 0,
    testsRun: 0,
    errorsEncountered: 0,
    sessionStartedAt: new Date().toISOString(),
  };
}

function createDefaultState(): AgentState {
  return {
    currentMode: "IDLE",
    currentTask: null,
    recentArtifacts: [],
    modeHistory: [],
    pendingReviews: [],
    statistics: createDefaultStatistics(),
    lastUpdated: new Date().toISOString(),
  };
}

async function loadTaskBoundaryState(): Promise<TaskBoundaryState | null> {
  return readJsonFile<TaskBoundaryState | null>(STATE_FILE, null);
}

async function loadArtifacts(): Promise<RecentArtifact[]> {
  const data = await readJsonFile<ArtifactsState>(ARTIFACTS_FILE, { artifacts: [] });
  return data.artifacts.slice(0, MAX_RECENT_ARTIFACTS);
}

async function loadPendingReviews(): Promise<PendingReview[]> {
  const data = await readJsonFile<ReviewsState>(REVIEWS_FILE, { pendingReviews: [] });
  return data.pendingReviews;
}

async function loadStatistics(): Promise<SessionStatistics> {
  return readJsonFile<SessionStatistics>(STATISTICS_FILE, createDefaultStatistics());
}

function extractModeHistory(taskState: TaskBoundaryState | null): ModeHistoryEntry[] {
  if (!taskState?.currentTask?.modeHistory) {
    return [];
  }

  const history = taskState.currentTask.modeHistory
    .filter((entry) => entry.to)
    .map((entry) => ({
      mode: entry.to as AgentMode,
      timestamp: entry.timestamp,
      taskName: taskState.currentTask?.taskName,
    }))
    .slice(-MAX_MODE_HISTORY);

  return history;
}

function determineCurrentMode(taskState: TaskBoundaryState | null): AgentMode {
  if (!taskState?.currentTask) {
    return "IDLE";
  }

  const mode = taskState.currentTask.mode;
  if (mode === "PLANNING" || mode === "EXECUTION" || mode === "VERIFICATION") {
    return mode;
  }

  return "IDLE";
}

function extractCurrentTask(taskState: TaskBoundaryState | null): CurrentTask | null {
  if (!taskState?.currentTask) {
    return null;
  }

  return {
    name: taskState.currentTask.taskName,
    status: taskState.currentTask.taskStatus,
    summary: taskState.currentTask.taskSummary,
    startedAt: taskState.currentTask.createdAt,
  };
}

// Main handler for get_agent_state
export async function handleGetAgentState(
  input: GetAgentStateInput
): Promise<string> {
  const taskState = await loadTaskBoundaryState();
  const artifacts = await loadArtifacts();
  const pendingReviews = await loadPendingReviews();
  const statistics = await loadStatistics();

  const agentState: AgentState = {
    currentMode: determineCurrentMode(taskState),
    currentTask: extractCurrentTask(taskState),
    recentArtifacts: artifacts,
    modeHistory: extractModeHistory(taskState),
    pendingReviews,
    statistics,
    projectPath: input.projectPath,
    lastUpdated: taskState?.lastUpdated ?? new Date().toISOString(),
  };

  // Build response
  const response = {
    success: true,
    state: agentState,
    summary: buildStateSummary(agentState),
  };

  return JSON.stringify(response, null, 2);
}

function buildStateSummary(state: AgentState): string {
  const lines: string[] = [];

  lines.push(`Mode: ${state.currentMode}`);

  if (state.currentTask) {
    lines.push(`Task: ${state.currentTask.name}`);
    lines.push(`Status: ${state.currentTask.status}`);
    if (state.currentTask.summary) {
      lines.push(`Summary: ${state.currentTask.summary}`);
    }
  } else {
    lines.push("Task: None active");
  }

  lines.push(`Artifacts: ${state.recentArtifacts.length} recent`);
  lines.push(`Pending Reviews: ${state.pendingReviews.length}`);
  lines.push(`Tool Calls: ${state.statistics.toolCallsInSession}`);
  lines.push(`Tasks Completed: ${state.statistics.tasksCompleted}`);

  return lines.join("\n");
}

// Main handler for reset_agent_state
export async function handleResetAgentState(
  input: ResetAgentStateInput
): Promise<string> {
  const timestamp = new Date().toISOString();
  const preserveStats = input.preserveStatistics ?? false;

  // Load existing statistics if preserving
  let statistics: SessionStatistics;
  if (preserveStats) {
    statistics = await loadStatistics();
    // Update session start time even when preserving
    statistics.sessionStartedAt = timestamp;
  } else {
    statistics = createDefaultStatistics();
  }

  // Reset main state file
  const resetState: TaskBoundaryState = {
    currentTask: null,
    lastUpdated: timestamp,
  };
  await writeJsonFile(STATE_FILE, resetState);

  // Reset artifacts
  await writeJsonFile(ARTIFACTS_FILE, { artifacts: [] });

  // Reset pending reviews
  await writeJsonFile(REVIEWS_FILE, { pendingReviews: [] });

  // Write statistics (reset or preserved)
  await writeJsonFile(STATISTICS_FILE, statistics);

  const response = {
    success: true,
    message: "Agent state reset successfully",
    timestamp,
    preservedStatistics: preserveStats,
    projectPath: input.projectPath,
    clearedItems: {
      currentTask: true,
      modeHistory: true,
      artifacts: true,
      pendingReviews: true,
      statistics: !preserveStats,
    },
  };

  return JSON.stringify(response, null, 2);
}
