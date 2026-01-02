import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

/**
 * Returns the path to ~/.antigravity/ directory.
 * Creates the directory if it doesn't exist.
 */
export function getAntigravityDir(): string {
  const dir = path.join(os.homedir(), ".antigravity");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Creates a short hash of the project path for unique directory names.
 */
export function getProjectHash(projectPath: string): string {
  return crypto.createHash("sha256").update(projectPath).digest("hex").slice(0, 8);
}

/**
 * Creates a directory recursively if it doesn't exist.
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Reads a JSON file and returns its parsed contents.
 * Returns the default value if the file doesn't exist.
 */
export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Writes data to a JSON file with pretty formatting.
 */
export function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Returns the current timestamp in ISO format.
 */
export function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Generates a short unique ID.
 */
export function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}
