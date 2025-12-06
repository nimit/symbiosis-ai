import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  StateGraph,
  END,
  START,
  Annotation,
  MemorySaver,
} from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { userProfileStore } from "./db.js";

const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.5-flash",
  temperature: 0.2,
});

// --- SCHEMAS ---

const TopicAssignmentSchema = z.object({
  topic: z.string(),
  userASide: z.enum(["For", "Against"]),
  userBSide: z.enum(["For", "Against"]),
});

const DebateEvaluationSchema = z.object({
  rationale: z.string().describe("Critique and reason for the decision"),
  scores: z
    .array(
      z.object({
        userId: z.string(),
        score: z.number().describe("Score from 0-100"),
      })
    )
    .describe("List of scores for each participant"),
});

// --- NODES ---

// Node: collectStart
// Handles the entry phase. If one user waits, tell them.
async function nodeCollectStart(state) {
  const participants = state.participants;

  if (participants.length === 1) {
    return {
      uiMessage: "Welcome! Waiting for an opponent to join...",
    };
  }
  // If 2 users, we pass through to initDebate immediately.
  // We return null here so we don't overwrite initDebate's message if it runs in same step.
  return { uiMessage: null };
}

// Node: initDebate
// Selects topic and assigns sides.
async function nodeInitDebate(state) {
  const [userA, userB] = state.participants;
  const profileA = await userProfileStore.get(userA);
  const profileB = await userProfileStore.get(userB);

  const generator = model.withStructuredOutput(TopicAssignmentSchema);
  const prompt = `
    User A (${userA}): ${JSON.stringify(profileA)}
    User B (${userB}): ${JSON.stringify(profileB)}
    Pick a debate topic and assign sides.
  `;

  const result = await generator.invoke(prompt);

  // Construct a message for the user who just triggered this (User B)
  const msg = `Topic Selected: "${result.topic}"\n\nAssignments:\n${userA}: ${result.userASide}\n${userB}: ${result.userBSide}\n\nPlease submit your arguments.`;

  return {
    topic: result.topic,
    assignments: {
      [userA]: result.userASide,
      [userB]: result.userBSide,
    },
    currentInputs: null, // Clear inputs
    uiMessage: msg,
  };
}

// Node: collectArguments
// Handles argument intake and status updates.
async function nodeCollectArguments(state) {
  const inputs = state.currentInputs || {};
  const repliedUsers = Object.keys(inputs);

  // Case 1: Fresh entry from initDebate (0 inputs)
  // We don't want to overwrite the "Topic Selected" message from the previous node.
  if (repliedUsers.length === 0) {
    return {};
  }

  // Case 2: One user has replied. We need to confirm receipt to them.
  if (repliedUsers.length === 1) {
    const waiter = repliedUsers[0];
    const opponent = state.participants.find((u) => u !== waiter);

    // Generate a stylized confirmation
    const prompt = `
      User ${waiter} just sent their argument for topic "${state.topic}".
      User ${opponent} hasn't yet.
      In a neutral tone, acknowledge ${waiter} and say we are waiting for ${opponent} in a stylized, fun, gen-z way.
    `;
    const response = await model.invoke([new HumanMessage(prompt)]);

    return { uiMessage: response.content };
  }

  // Case 3: Both replied. Passing to judge.
  return { uiMessage: "Both arguments received. Judging now..." };
}

// Node: judgeDebate
// Calculates winner and returns final result text.
async function nodeJudgeDebate(state) {
  const [userA, userB] = state.participants;
  const argA = state.currentInputs[userA].replace("`", "");
  const argB = state.currentInputs[userB].replace("`", "");

  const judge = model.withStructuredOutput(DebateEvaluationSchema);
  const prompt = `
    Topic: ${state.topic}
    User ${userA} (${state.assignments[userA]}): "${argA}"
    User ${userB} (${state.assignments[userB]}): "${argB}"
    Score 0-100 and provide rationale.
  `;
  const result = await judge.invoke([new HumanMessage(prompt)]);

  const sortedScores = result.scores.sort((a, b) => b.score - a.score);

  // Safe extraction (Handle ties/errors)
  const winnerEntry = sortedScores[0];
  const loserEntry = sortedScores[1];

  const winnerId = winnerEntry?.userId || userA;
  const winnerScore = winnerEntry?.score || 0;

  const loserId = loserEntry?.userId || userB;
  const loserScore = loserEntry?.score || 0;

  // Reconstruct a map for easy frontend display if needed, or keep array
  const scoreMap = {
    [winnerId]: winnerScore,
    [loserId]: loserScore,
  };

  const finalText = `DEBATE OVER!\n\nWinner: ${winnerId} (Score: ${winnerScore})\nLoser: ${loserId} (Score: ${loserScore})\n\nJudge's Rationale: ${result.rationale}`;

  return {
    winnerData: {
      winnerId,
      loserId,
      rationale: result.rationale,
      scores: scoreMap,
    },
    uiMessage: finalText,
  };
}

// Node: updateProfiles
// Saves data silently.
async function nodeUpdateProfiles(state) {
  const { winnerId, loserId } = state.winnerData;
  const { topic } = state;

  // Update Winner
  const wProfile = await userProfileStore.get(winnerId);
  wProfile.debateHistory.push({ topic, result: "win", date: Date.now() });
  await userProfileStore.save(winnerId, wProfile);

  // Update Loser
  const lProfile = await userProfileStore.get(loserId);
  lProfile.debateHistory.push({ topic, result: "loss", date: Date.now() });
  await userProfileStore.save(loserId, lProfile);

  return {};
}

// --- LOGIC / EDGES ---

const shouldStart = (state) => {
  const inputCount = Object.keys(state.currentInputs || {}).length;

  // 1. If a topic exists, we are past the setup phase.
  // We should go straight to collecting arguments.
  if (state.topic) {
    return "nodeCollectArguments";
  }

  // 2. If no topic, we are in setup.
  // Only proceed to Init if we have 2 "start" messages.
  if (inputCount >= 2) {
    return "nodeInitDebate";
  }

  // 3. Otherwise, wait for more users.
  return END;
};

const shouldJudge = (state) =>
  Object.keys(state.currentInputs || {}).length >= 2 ? "nodeJudgeDebate" : END;

const GraphState = Annotation.Root({
  // 1. PARTICIPANTS: Needs custom merging (Append + Unique)
  participants: Annotation({
    reducer: (x, y) => {
      const prev = x || [];
      const next = y || [];
      return Array.from(new Set([...prev, ...next]));
    },
    default: () => [],
  }),
  // 2. INPUTS: Needs custom merging (Object Merge)
  currentInputs: Annotation({
    reducer: (x, y) => {
      // If y is explicitly null, clear the inputs (return empty obj)
      if (y === null) return {};
      // Otherwise merge new inputs into old inputs
      return { ...x, ...y };
    },
    default: () => ({}),
  }),
  topic: Annotation(),
  assignments: Annotation(),
  winnerData: Annotation(),
  uiMessage: Annotation(),
});

const workflow = new StateGraph(GraphState)
  .addNode("nodeCollectStart", nodeCollectStart)
  .addNode("nodeInitDebate", nodeInitDebate)
  .addNode("nodeCollectArguments", nodeCollectArguments)
  .addNode("nodeJudgeDebate", nodeJudgeDebate)
  .addNode("nodeUpdateProfiles", nodeUpdateProfiles)

  .addEdge(START, "nodeCollectStart")
  .addConditionalEdges("nodeCollectStart", shouldStart)
  .addEdge("nodeInitDebate", "nodeCollectArguments")
  .addConditionalEdges("nodeCollectArguments", shouldJudge)
  .addEdge("nodeJudgeDebate", "nodeUpdateProfiles")
  .addEdge("nodeUpdateProfiles", END);

// const checkpointer = await RedisSaver.fromUrl("redis://localhost:6379");
const checkpointer = new MemorySaver();
const app = workflow.compile({ checkpointer });

// --- EXPORTED RUNNER ---

export async function processDebateMessage(threadId, userId, text) {
  const config = { configurable: { thread_id: threadId } };

  // 1. Prepare input
  const inputDelta = {
    participants: [userId],
    currentInputs: { [userId]: text },
  };

  // 2. Execute Graph & Capture Result
  // app.invoke returns the final state values of this run
  const finalState = await app.invoke(inputDelta, config);

  // 4. Return formatted result
  return {
    text: finalState.uiMessage || null,
  };
}

// export async function processDebateMessage(threadId, userId, userMessage) {
//   const config = { configurable: { thread_id: threadId } };

//   let result = {
//     text: null,
//   };

//   const stream = await app.stream(
//     {
//       participants: [userId],
//       currentInputs: { [userId]: userMessage },
//     },
//     config
//   );

//   for await (const event of stream) {
//     const nodeName = Object.keys(event)[0];
//     const data = event[nodeName];

//     // Check if this node update included a uiMessage
//     if (data && data.uiMessage) {
//       result.text = data.uiMessage;

//       console.log(
//         "conversation event. at node",
//         nodeName,
//         "with response",
//         result.text
//       );
//     }
//   }

//   return result;
// }
