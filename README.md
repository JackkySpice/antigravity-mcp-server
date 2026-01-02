# AntiGravity MCP Server for OpenCode

A Model Context Protocol (MCP) server that replicates [Google AntiGravity IDE's](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/prompt_caching) agentic workflow patterns. This server enables structured agent behavior through explicit mode management, user communication protocols, artifact handling, and persistent knowledge storage—bringing AntiGravity's proven methodology to OpenCode.

## Features

| Tool | Description |
|------|-------------|
| `task_boundary` | PLANNING/EXECUTION/VERIFICATION mode management for structured agent workflows |
| `notify_user` | User communication with ConfidenceScore for transparency and trust calibration |
| `create_artifact` / `update_artifact` | Artifact management for files, code, and generated content |
| `save_knowledge` / `search_knowledge` | Knowledge Items persistence and retrieval for context continuity |
| `get_agent_state` / `reset_agent_state` | State tracking for debugging and workflow introspection |

## Installation

```bash
git clone https://github.com/JackkySpice/antigravity-mcp-server
cd antigravity-mcp-server
npm install
npm run build
```

## OpenCode Configuration

Add the server to your MCP configuration file (`mcp.json`):

```json
{
  "mcpServers": {
    "antigravity": {
      "command": "node",
      "args": ["/path/to/antigravity-mcp-server/dist/index.js"]
    }
  }
}
```

> **Note:** Replace `/path/to/antigravity-mcp-server` with the actual path where you cloned the repository.

## Usage Examples

### Task Boundary Management

Control the agent's operational mode to enforce structured workflows:

```typescript
// Enter planning mode before analyzing a task
await mcp.call("task_boundary", {
  mode: "PLANNING",
  taskDescription: "Implement user authentication feature"
});

// Transition to execution after planning is complete
await mcp.call("task_boundary", {
  mode: "EXECUTION",
  taskDescription: "Creating auth middleware and routes"
});

// Verify the implementation
await mcp.call("task_boundary", {
  mode: "VERIFICATION",
  taskDescription: "Running tests and validating auth flow"
});
```

### User Notification with Confidence Score

Communicate with users while indicating certainty levels:

```typescript
// High confidence notification
await mcp.call("notify_user", {
  message: "Successfully refactored the database layer",
  confidenceScore: 0.95,
  category: "success"
});

// Lower confidence - seeking confirmation
await mcp.call("notify_user", {
  message: "I believe this API endpoint needs rate limiting, but please verify",
  confidenceScore: 0.65,
  category: "suggestion"
});
```

### Artifact Management

Create and update artifacts for tracking generated content:

```typescript
// Create a new artifact
await mcp.call("create_artifact", {
  name: "auth-middleware.ts",
  type: "code",
  content: "export const authMiddleware = (req, res, next) => { ... }",
  metadata: { language: "typescript", path: "src/middleware/" }
});

// Update an existing artifact
await mcp.call("update_artifact", {
  artifactId: "auth-middleware-001",
  content: "// Updated implementation with JWT validation...",
  changelog: "Added JWT token verification"
});
```

### Knowledge Persistence

Save and retrieve knowledge items across sessions:

```typescript
// Save learned knowledge
await mcp.call("save_knowledge", {
  key: "project-conventions",
  content: "This project uses camelCase for variables, PascalCase for components",
  tags: ["style", "conventions", "naming"]
});

// Search for relevant knowledge
const results = await mcp.call("search_knowledge", {
  query: "naming conventions",
  tags: ["style"],
  limit: 5
});
```

### State Management

Inspect and reset agent state for debugging:

```typescript
// Get current agent state
const state = await mcp.call("get_agent_state", {});
console.log(state);
// { mode: "EXECUTION", artifacts: [...], knowledgeCount: 12 }

// Reset state for a fresh start
await mcp.call("reset_agent_state", {
  preserveKnowledge: true  // Keep learned knowledge, reset mode and artifacts
});
```

## System Prompt

For optimal results, use this MCP server with the accompanying system prompt that enforces AntiGravity's agentic workflow patterns:

```
./prompts/antigravity-system-prompt.md
```

The system prompt instructs the agent to:
- Always declare mode transitions via `task_boundary`
- Report confidence levels with `notify_user`
- Track all generated content as artifacts
- Persist important learnings to knowledge storage

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           OpenCode CLI                                   │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        MCP Client Layer                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                  │                                      │
│                                  │ JSON-RPC                             │
│                                  ▼                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     AntiGravity MCP Server                              │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Mode Manager   │  │  Notification   │  │   Artifact Registry     │  │
│  │                 │  │     Engine      │  │                         │  │
│  │  ┌───────────┐  │  │                 │  │  ┌───────┐ ┌───────┐   │  │
│  │  │ PLANNING  │  │  │  ConfidenceScore│  │  │ Code  │ │ Docs  │   │  │
│  │  ├───────────┤  │  │     [0.0-1.0]   │  │  ├───────┤ ├───────┤   │  │
│  │  │ EXECUTION │  │  │                 │  │  │ Files │ │ Data  │   │  │
│  │  ├───────────┤  │  │                 │  │  └───────┘ └───────┘   │  │
│  │  │VERIFICATION│ │  │                 │  │                         │  │
│  │  └───────────┘  │  │                 │  │                         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │       Knowledge Store           │  │       State Tracker         │  │
│  │                                 │  │                             │  │
│  │  ┌─────────────────────────┐   │  │  • Current Mode             │  │
│  │  │  Key-Value + Tags       │   │  │  • Active Artifacts         │  │
│  │  │  Semantic Search        │   │  │  • Session History          │  │
│  │  │  Persistent Storage     │   │  │  • Debug Logs               │  │
│  │  └─────────────────────────┘   │  │                             │  │
│  └─────────────────────────────────┘  └─────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Persistent Storage
                                   ▼
                          ┌───────────────────┐
                          │   ~/.antigravity/ │
                          │   ├── knowledge/  │
                          │   ├── artifacts/  │
                          │   └── state.json  │
                          └───────────────────┘
```

## Workflow Diagram

```
                    ┌──────────────────────────────────────┐
                    │            User Request              │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │   task_boundary(mode: "PLANNING")    │
                    │                                      │
                    │   • Analyze requirements             │
                    │   • Search existing knowledge        │
                    │   • Formulate approach               │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │  notify_user(confidence: 0.8)        │
                    │  "Here's my plan..."                 │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │  task_boundary(mode: "EXECUTION")    │
                    │                                      │
                    │   • Create/update artifacts          │
                    │   • Save new knowledge               │
                    │   • Implement solution               │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │ task_boundary(mode: "VERIFICATION")  │
                    │                                      │
                    │   • Validate artifacts               │
                    │   • Run tests                        │
                    │   • Check against requirements       │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │  notify_user(confidence: 0.95)       │
                    │  "Task complete. All tests pass."    │
                    └──────────────────────────────────────┘
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
