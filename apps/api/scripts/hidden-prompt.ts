import process from "node:process";

const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const BACKSPACE = "\u007f";

export function readHiddenLine(prompt: string): Promise<string> {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    return Promise.reject(new Error("A terminal is required to type the password"));
  }

  return new Promise((resolve, reject) => {
    let typed = "";

    const finish = (done: () => void): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      done();
    };

    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          finish(() => resolve(typed));
          return;
        }

        if (char === CTRL_C || char === CTRL_D) {
          finish(() => reject(new Error("Cancelled")));
          return;
        }

        typed = char === BACKSPACE ? typed.slice(0, -1) : typed + char;
      }
    };

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
