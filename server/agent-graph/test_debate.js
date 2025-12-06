import { processDebateMessage } from "./debateGraph.js";
import { userProfileStore } from "./db.js";

const THREAD_ID = "stream_demo_room_" + Date.now();

async function graph(userId, userMessage) {
  console.log(`\n>> ${userId} says: "${userMessage}"`);
  const result = await processDebateMessage(THREAD_ID, userId, userMessage);
  // We don't need to log result here if the stream loop logs it,
  // but for the test output we print the final return:
  console.log("Final Return:", result);
}

(async () => {
  const USER_A = "debate_user_alice";
  const USER_B = "debate_user_bob";

  // Ensure DB data exists
  await userProfileStore.save(USER_A, {
    userName: "Alice",
    userPreferences: ["Code"],
    debateHistory: [],
  });
  await userProfileStore.save(USER_B, {
    userName: "Bob",
    userPreferences: ["Design"],
    debateHistory: [],
  });

  console.log(`=== STARTING STREAM TEST (${THREAD_ID}) ===`);

  // 1. Alice joins
  await graph(USER_A, "start");

  // 2. Bob joins (Should trigger initDebate -> output topic)
  await graph(USER_B, "start");

  // 3. Alice argues
  await graph(USER_A, "Functionality is more important than aesthetics.");

  // 4. Bob argues (Should trigger judge -> output winner)
  await graph(USER_B, "Without good design, functionality is unusable.");

  console.log("=== END ===");
  process.exit(0);
})();
