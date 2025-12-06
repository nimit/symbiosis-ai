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
          userName: "",
          userPreferences: [],
          userMood: [],
          userCharacteristics: [],
          debateHistory: [],
        };
  },
  save: async (userId, data) => {
    await redis.set(`user:${userId}`, JSON.stringify(data));
    console.log(`[DB] Saved data for ${userId} | ${JSON.stringify(data)}`);
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

  const data2 = {
    userName: "ali",
    userPreferences: [
      "hates dogs; has been bitten thrice",
      "likes living in the city",
      "enjoys working out in gym",
      "recently bought a size 14 shoe",
    ],
    userMood: ["frustrated"],
    userCharacteristics: ["introvert", "sporty", "machine learning engineer"],
  };
  redis.set("user:+19342559044", JSON.stringify(data2));

  const data3 = {
    userName: "mr. x",
    userPreferences: ["likes anime", "likes dogs", "likes mountains"],
    userMood: ["frustrated"],
    userCharacteristics: ["introvert", "sporty", "machine learning engineer"],
  };
  redis.set("user:+15102055337", JSON.stringify(data3));
};

export default redis;

// "{\"userName\":\"<user>\",\"userPreferences\":[\"likes One Piece\",\"likes Naruto\",\"thinks One Piece and Naruto are the best anime\",\"needs coding buddies\",\"wishes for a simpler life\",\"likes dogs\",\"likes mountains\"],\"userMood\":[\"tired\",\"wishing for simplicity\"],\"userCharacteristics\":[\"named Alex\"],\"debateHistory\":[]}"
