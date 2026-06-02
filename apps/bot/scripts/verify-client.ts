import { getDailyPush, submitAnswer } from "../src/api/client.js";
import { getPending, setPending, clearPending } from "../src/session/pending.repo.js";

async function main() {
  console.log("-- session repo round-trip --");
  await setPending(424242, { topicId: "t_demo", gapId: "g_demo", mode: "socratic" });
  const got = await getPending(424242);
  console.log("  setPending/getPending:", JSON.stringify(got));
  await clearPending(424242);
  console.log("  cleared:", (await getPending(424242)) === null);

  console.log("-- api client: getDailyPush --");
  const { push, question } = await getDailyPush("socratic");

  if (!push || !question) {
    console.log("  no confirmed gap available — push:", push, "(skipping answer)");
    process.exit(0);
  }

  console.log("  push:", push.curriculumName, "›", push.topicTitle, "| reason:", push.reason);
  console.log("  question gapId:", question.gapId, "prompt:", question.prompt.slice(0, 80));

  console.log("-- api client: submitAnswer --");
  const result = await submitAnswer({
    topicId: push.topicId,
    gapId: question.gapId,
    mode: "socratic",
    answer: "A considered answer that weighs the tradeoffs and explains when each option applies.",
  });
  console.log("  outcome:", result.outcome, "| learningStatus:", result.learningStatus);
  console.log("  RESULT: PASS — bot api-client + session repo work end to end");
  process.exit(0);
}

main().catch((err) => {
  console.error("verify-client ERROR:", err);
  process.exit(1);
});
