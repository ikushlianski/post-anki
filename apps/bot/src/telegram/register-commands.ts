import { HELP_COMMANDS } from "./help-command.js";
import { log } from "./log.js";

export interface BotCommand {
  command: string;
  description: string;
}

const MAX_DESCRIPTION_CHARS = 256;

export function buildBotCommands(): BotCommand[] {
  return HELP_COMMANDS.filter((entry) => entry.command.startsWith("/")).map((entry) => ({
    command: entry.command.split(" ")[0]!.slice(1),
    description: entry.description.slice(0, MAX_DESCRIPTION_CHARS),
  }));
}

export async function registerBotCommands(
  setMyCommands: (commands: BotCommand[]) => Promise<unknown>,
): Promise<boolean> {
  try {
    await setMyCommands(buildBotCommands());

    return true;
  } catch (err) {
    log.error({ err }, "set_my_commands_failed");

    return false;
  }
}
