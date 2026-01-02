import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Notification record interface
interface NotificationRecord {
  timestamp: string;
  message: string;
  pathsToReview?: string[];
  blockedOnUser?: boolean;
  confidenceScore?: number;
  confidenceJustification?: string;
  shouldAutoProceed?: boolean;
}

interface NotificationHistory {
  notifications: NotificationRecord[];
}

// Tool definition for MCP SDK
export const notifyUserTool = {
  name: "notify_user",
  description:
    "Notify the user with a message, optionally including paths to review, " +
    "blocking status, confidence score, and auto-proceed preference. " +
    "Use this to communicate status updates, request reviews, or indicate " +
    "when user input is needed.",
  inputSchema: {
    type: "object" as const,
    properties: {
      Message: {
        type: "string",
        description: "Message to notify user",
      },
      PathsToReview: {
        type: "array",
        items: { type: "string" },
        description: "Absolute paths for user review",
      },
      BlockedOnUser: {
        type: "boolean",
        description: "True if blocked on user approval",
      },
      ConfidenceScore: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "0.0 to 1.0 confidence rating",
      },
      ConfidenceJustification: {
        type: "string",
        description: "Justification for confidence score",
      },
      ShouldAutoProceed: {
        type: "boolean",
        description: "If can proceed without feedback",
      },
    },
    required: ["Message"],
  },
};

// Notifications file path
const NOTIFICATIONS_DIR = join(homedir(), ".antigravity");
const NOTIFICATIONS_FILE = join(NOTIFICATIONS_DIR, "notifications.json");

async function ensureNotificationsDir(): Promise<void> {
  try {
    await fs.mkdir(NOTIFICATIONS_DIR, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

async function loadNotificationHistory(): Promise<NotificationHistory> {
  try {
    const content = await fs.readFile(NOTIFICATIONS_FILE, "utf-8");
    return JSON.parse(content) as NotificationHistory;
  } catch {
    return { notifications: [] };
  }
}

async function saveNotificationHistory(
  history: NotificationHistory
): Promise<void> {
  await ensureNotificationsDir();
  await fs.writeFile(
    NOTIFICATIONS_FILE,
    JSON.stringify(history, null, 2),
    "utf-8"
  );
}

/**
 * Formats confidence score as a visual bar
 */
function formatConfidenceBar(score: number): string {
  const filledBlocks = Math.round(score * 10);
  const emptyBlocks = 10 - filledBlocks;
  const bar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
  const percentage = (score * 100).toFixed(0);
  return `[${bar}] ${percentage}%`;
}

/**
 * Formats the notification output for display
 */
function formatNotificationOutput(args: {
  Message: string;
  PathsToReview?: string[];
  BlockedOnUser?: boolean;
  ConfidenceScore?: number;
  ConfidenceJustification?: string;
  ShouldAutoProceed?: boolean;
}): string {
  const lines: string[] = [];
  const divider = "─".repeat(50);

  lines.push(divider);
  lines.push("📢 NOTIFICATION");
  lines.push(divider);
  lines.push("");
  lines.push(args.Message);
  lines.push("");

  if (args.PathsToReview && args.PathsToReview.length > 0) {
    lines.push("📁 Paths to Review:");
    for (const p of args.PathsToReview) {
      lines.push(`   • ${p}`);
    }
    lines.push("");
  }

  if (args.ConfidenceScore !== undefined) {
    lines.push(`🎯 Confidence: ${formatConfidenceBar(args.ConfidenceScore)}`);
    if (args.ConfidenceJustification) {
      lines.push(`   ${args.ConfidenceJustification}`);
    }
    lines.push("");
  }

  if (args.BlockedOnUser === true) {
    lines.push("⏸️  Status: BLOCKED - Waiting for user approval");
    lines.push("");
  }

  if (args.ShouldAutoProceed === true) {
    lines.push("✅ Auto-proceed: Will continue without explicit feedback");
    lines.push("");
  } else if (args.ShouldAutoProceed === false) {
    lines.push("⏳ Waiting: Requires user feedback to proceed");
    lines.push("");
  }

  lines.push(divider);

  return lines.join("\n");
}

// Main handler function
export async function handleNotifyUser(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  // Extract and validate arguments
  const Message = args.Message as string | undefined;
  const PathsToReview = args.PathsToReview as string[] | undefined;
  const BlockedOnUser = args.BlockedOnUser as boolean | undefined;
  const ConfidenceScore = args.ConfidenceScore as number | undefined;
  const ConfidenceJustification = args.ConfidenceJustification as string | undefined;
  const ShouldAutoProceed = args.ShouldAutoProceed as boolean | undefined;

  // Validate required fields
  if (!Message || typeof Message !== "string") {
    return {
      content: [{ type: "text", text: "Error: Message is required and must be a string" }],
      isError: true,
    };
  }

  // Validate PathsToReview if provided
  if (PathsToReview !== undefined) {
    if (!Array.isArray(PathsToReview)) {
      return {
        content: [{ type: "text", text: "Error: PathsToReview must be an array of strings" }],
        isError: true,
      };
    }
    for (const p of PathsToReview) {
      if (typeof p !== "string") {
        return {
          content: [{ type: "text", text: "Error: PathsToReview must contain only strings" }],
          isError: true,
        };
      }
    }
  }

  // Validate BlockedOnUser if provided
  if (BlockedOnUser !== undefined && typeof BlockedOnUser !== "boolean") {
    return {
      content: [{ type: "text", text: "Error: BlockedOnUser must be a boolean" }],
      isError: true,
    };
  }

  // Validate ConfidenceScore if provided
  if (ConfidenceScore !== undefined) {
    if (typeof ConfidenceScore !== "number") {
      return {
        content: [{ type: "text", text: "Error: ConfidenceScore must be a number" }],
        isError: true,
      };
    }
    if (ConfidenceScore < 0 || ConfidenceScore > 1) {
      return {
        content: [{ type: "text", text: "Error: ConfidenceScore must be between 0.0 and 1.0" }],
        isError: true,
      };
    }
  }

  // Validate ConfidenceJustification if provided
  if (ConfidenceJustification !== undefined && typeof ConfidenceJustification !== "string") {
    return {
      content: [{ type: "text", text: "Error: ConfidenceJustification must be a string" }],
      isError: true,
    };
  }

  // Validate ShouldAutoProceed if provided
  if (ShouldAutoProceed !== undefined && typeof ShouldAutoProceed !== "boolean") {
    return {
      content: [{ type: "text", text: "Error: ShouldAutoProceed must be a boolean" }],
      isError: true,
    };
  }

  const timestamp = new Date().toISOString();

  // Create notification record
  const record: NotificationRecord = {
    timestamp,
    message: Message,
  };

  if (PathsToReview !== undefined) {
    record.pathsToReview = PathsToReview;
  }
  if (BlockedOnUser !== undefined) {
    record.blockedOnUser = BlockedOnUser;
  }
  if (ConfidenceScore !== undefined) {
    record.confidenceScore = ConfidenceScore;
  }
  if (ConfidenceJustification !== undefined) {
    record.confidenceJustification = ConfidenceJustification;
  }
  if (ShouldAutoProceed !== undefined) {
    record.shouldAutoProceed = ShouldAutoProceed;
  }

  // Save to notification history
  try {
    const history = await loadNotificationHistory();
    history.notifications.push(record);
    await saveNotificationHistory(history);
  } catch (error) {
    // Log error but don't fail the tool - notification display is more important
    console.error("Failed to save notification history:", error);
  }

  // Format and return output
  const formattedOutput = formatNotificationOutput({
    Message,
    PathsToReview,
    BlockedOnUser,
    ConfidenceScore,
    ConfidenceJustification,
    ShouldAutoProceed,
  });

  return {
    content: [{ type: "text", text: formattedOutput }],
  };
}
