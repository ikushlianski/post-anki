import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".seed-token")) {
  const token = readFileSync(".seed-token", "utf8").trim();

  writeFileSync("dist/seed-token.json", JSON.stringify({ token }));
}
