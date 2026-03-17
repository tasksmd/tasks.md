import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TASKS_TEMPLATE = `# Tasks

## P1

## P2
`;

const TASK_MANAGEMENT_SECTION = `
## Task Management

- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Commit TASKS.md changes separately from code changes
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
`;

export interface InitResult {
  createdTasks: boolean;
  updatedAgents: boolean;
  messages: string[];
}

export function initTaskQueue(targetDir: string): InitResult {
  const messages: string[] = [];
  let createdTasks = false;
  let updatedAgents = false;

  const tasksFile = join(targetDir, "TASKS.md");
  if (existsSync(tasksFile)) {
    messages.push("⊘ TASKS.md already exists — skipping");
  } else {
    writeFileSync(tasksFile, TASKS_TEMPLATE);
    createdTasks = true;
    messages.push("✓ Created TASKS.md");
  }

  const agentsFile = join(targetDir, "AGENTS.md");
  if (existsSync(agentsFile)) {
    const content = readFileSync(agentsFile, "utf-8");
    if (content.includes("## Task Management")) {
      messages.push("⊘ AGENTS.md already has Task Management section — skipping");
    } else {
      writeFileSync(agentsFile, content + TASK_MANAGEMENT_SECTION);
      updatedAgents = true;
      messages.push("✓ Added Task Management section to AGENTS.md");
    }
  } else {
    messages.push("⊘ No AGENTS.md found — skipping");
  }

  return { createdTasks, updatedAgents, messages };
}
