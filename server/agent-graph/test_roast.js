import { processRoastMessage } from "./roast_graph.js";
import { userProfileStore } from "./db.js";
import redis from "./db.js";

const THREAD_ID = "roast_room_" + Date.now();

async function graph(userId, userMessage) {
  console.log(`\n>> ${userId} says: "${userMessage}"`);

  const results = await processRoastMessage(THREAD_ID, userId, userMessage);
  console.log("\n[AI ROAST MASTER]:", results.map((r) => r.text).join("\n\n"));
}

(async () => {
  const USER_A = "roast_user_alice";
  const USER_B = "roast_user_bob";

  try {
    // 0. Seed Data
    console.log("=== SEEDING DB ===");
    await userProfileStore.save(USER_A, {
      userPreferences: [
        "Spaghetti Code",
        "Dark Mode Light Themes",
        "Using 'any' in TS",
      ],
    });
    await userProfileStore.save(USER_B, {
      userPreferences: ["Pixel Perfection", "Figma", "Micro-interactions"],
    });

    console.log(`=== STARTING ROAST SESSION (${THREAD_ID}) ===`);

    // 1. Alice joins (Start)
    // Graph should PAUSE here
    await graph(USER_A, "start");

    // 2. Bob joins (Start)
    // Graph should TRIGGER "roast_init" targeting Alice (first participant)
    await graph(USER_B, "start");

    // 3. Alice Defends herself
    // Graph should PAUSE here
    // await graph(USER_A, "I use 'any' because I am efficient, okay?");

    // 4. Bob Defends Alice (Scenario B) OR stays silent
    // Let's test SCENARIO B: Bob defends Alice.
    // Graph should TRIGGER "analyze" -> "roast_hypocrisy" -> "self_deprecate"
    await graph(USER_B, "Hey, leave her alone, her code works!");

    console.log("\n=== SESSION COMPLETE ===");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    redis.disconnect();
    process.exit(0);
  }
})();
