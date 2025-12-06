import Redis from "ioredis";

// 1. Connection to Redis
const redis = new Redis("redis://localhost:6379");

// 2. Helper to get/save the Long-Term User Profile
export const userProfileStore = {
  get: async (userId) => {
    const data = await redis.get(`user:${userId}`);
    // Return default structure if empty
    return data
      ? JSON.parse(data)
      : {
          userName: "<user>",
          userPreferences: [],
          userMood: [],
          userCharacteristics: [],
          debateHistory: [],
        };
  },
  save: async (userId, data) => {
    await redis.set(`user:${userId}`, JSON.stringify(data));
    console.log(`[DB] Saved data for ${userId}`);
  },
};

export const populateRedis = async () => {
  const data = {
    userName: "alex",
    userPreferences: [
      "likes dogs",
      "prefers mountains to beaches",
      "enjoys working out in gym",
      "likes anime",
    ],
    userMood: ["tired"],
    userCharacteristics: ["ambitious", "social", "software engineer"],
  };
  redis.set("user:+19342559239", JSON.stringify(data));
};

export default redis;
