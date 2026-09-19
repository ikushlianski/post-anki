export function isOpenTodoUnderDirection(todoMarkdown: string, direction: string, text: string): boolean {
  let inDirection = false;
  let inCodingTasks = false;

  for (const line of todoMarkdown.split("\n")) {
    if (line.startsWith("## ")) {
      inDirection = line.slice(3).trim() === direction;
      inCodingTasks = false;
      continue;
    }

    if (line.startsWith("### ")) {
      inCodingTasks = inDirection && line.slice(4).trim() === "Coding tasks";
      continue;
    }

    if (inCodingTasks && line.trimEnd() === `- [ ] ${text}`) {
      return true;
    }
  }

  return false;
}
