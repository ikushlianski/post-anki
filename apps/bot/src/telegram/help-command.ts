export const HELP_COMMANDS: ReadonlyArray<{ command: string; description: string }> = [
  { command: "/start", description: "Introduce the bot and begin a session." },
  { command: "/help", description: "Show this list of commands." },
  { command: "/today", description: "Get today's question." },
  { command: "/push", description: "Same as /today." },
  { command: "/chat [page]", description: "List your Chat cards, optionally a given page." },
  { command: "/digest", description: "Get your weekly numbers." },
  { command: "/rejected [reason|words]", description: "List rejected cards, filtered by a reason or words." },
  { command: "/inbox", description: "Show how many cards wait in your Inbox, with a link." },
  { command: "/find <words>", description: "Search your subjects, curricula and topics." },
  { command: "/streak", description: "Show cards due, your streak and recent accuracy." },
  { command: "/pause [days]", description: "Pause daily reminders (default 7 days, max 30)." },
  { command: "/resume", description: "Turn daily reminders back on." },
  { command: "/done", description: "Finish the current question." },
  { command: "/study [topic]", description: "Start studying a topic (or continue where you left off)." },
  { command: "skip", description: "Skip the current question." },
  { command: "let's continue [with tool]", description: "Resume your last session or a named tool." },
];

export const HELP_TEXT = [
  "Commands:",
  ...HELP_COMMANDS.map((entry) => `${entry.command} - ${entry.description}`),
].join("\n");

export const START_INTRO = "Quiz yourself on your cards.\nSend /help for commands.";
