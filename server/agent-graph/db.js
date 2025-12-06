import Redis from "ioredis";

// 1. Connection to Redis
const redis = new Redis("redis://localhost:6379");

// 2. Helper to get/save the Long-Term User Profile
export const userProfileStore = {
  get: async (userId) => {
    const data = await redis.get(`user:${userId}`);
    // Return default structure if empty
    return data ? JSON.parse(data) : { 
      userPreferences: [], 
      userMood: [], 
      userCharacteristics: [] 
    };
  },
  save: async (userId, data) => {
    await redis.set(`user:${userId}`, JSON.stringify(data));
  }
};

export default redis;