import { processLangGraphMessage } from "./single_user.js";

async function graph(userId, userMessage) {
  const result = await processLangGraphMessage(userId, userMessage);
  console.log(result);
}

// 5. Execute Simulation
(async () => {
  const USER = "user_123";

  // Interaction 1: Normal Chat
  await graph(
    USER,
    "Hi, I'm Alex. I'm a software engineer and I feel excited becaused of the new season of Stranger Things"
  );

  // Interaction 2: Request Match
  await graph(USER, "I think I'm ready to meet someone.");

  // Interaction 3: Provide Intro (Graph resumes at 'init_match')
  await graph(
    USER,
    "Hey there, looking for someone to watch the newest season of Stranger Things with."
  );

  // // Interaction 4: Reject Image (Graph resumes at 'generator' -> stops at 'approver')
  // await graph(USER, "No, that looks too dark. Make it brighter.");

  // // Interaction 5: Approve
  // await graph(USER, "Yes, that's perfect.");

  process.exit(0);
})();
