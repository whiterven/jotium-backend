import { Redis } from '@upstash/redis';

class JotiumMemory {
  constructor() {
    // Initialize Redis client from environment variables
    this.redis = Redis.fromEnv();
    
    // Configuration
    this.CHAT_HISTORY_LIMIT = 100; // Max messages per conversation
    this.CONVERSATION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
    this.MEMORY_TTL = 90 * 24 * 60 * 60; // 90 days for long-term memory
    this.MAX_CONVERSATIONS_PER_USER = 50; // Max conversations per user
  }

  // Key generation helpers
  getChatHistoryKey(userId, conversationId) {
    return `chat:${userId}:${conversationId}`;
  }

  getUserConversationsKey(userId) {
    return `user_conversations:${userId}`;
  }

  getConversationMetaKey(userId, conversationId) {
    return `conversation_meta:${userId}:${conversationId}`;
  }

  getUserMemoryKey(userId) {
    return `user_memory:${userId}`;
  }

  getConversationSummaryKey(userId, conversationId) {
    return `conversation_summary:${userId}:${conversationId}`;
  }

  // === CHAT HISTORY MANAGEMENT ===

  /**
   * Save a message to conversation history
   * @param {string} userId - User identifier
   * @param {string} conversationId - Conversation identifier
   * @param {Object} message - Message object
   * @returns {Promise<Object>} Saved message with ID
   */
  async saveMessage(userId, conversationId, message) {
    try {
      // Add timestamp and ID if not present
      const messageWithMeta = {
        id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
        userId,
        conversationId
      };

      const chatKey = this.getChatHistoryKey(userId, conversationId);
      const conversationsKey = this.getUserConversationsKey(userId);
      const metaKey = this.getConversationMetaKey(userId, conversationId);

      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Save message to conversation
      pipeline.lpush(chatKey, JSON.stringify(messageWithMeta));
      pipeline.ltrim(chatKey, 0, this.CHAT_HISTORY_LIMIT - 1);
      pipeline.expire(chatKey, this.CONVERSATION_TTL);

      // Track conversation for user
      pipeline.sadd(conversationsKey, conversationId);
      pipeline.expire(conversationsKey, this.CONVERSATION_TTL);

      // Update conversation metadata
      const conversationMeta = {
        lastActivity: messageWithMeta.timestamp,
        messageCount: await this.getMessageCount(userId, conversationId) + 1,
        participants: [userId],
        title: message.role === 'user' && message.content.length > 0 
          ? message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '')
          : 'New Conversation'
      };
      pipeline.hset(metaKey, conversationMeta);
      pipeline.expire(metaKey, this.CONVERSATION_TTL);

      await pipeline.exec();

      console.log(`💾 Message saved: ${userId}/${conversationId}/${messageWithMeta.id}`);
      return messageWithMeta;

    } catch (error) {
      console.error('❌ Error saving message:', error);
      throw new Error(`Failed to save message: ${error.message}`);
    }
  }

  /**
   * Get conversation history
   * @param {string} userId - User identifier
   * @param {string} conversationId - Conversation identifier
   * @param {number} limit - Number of messages to retrieve
   * @returns {Promise<Array>} Array of messages in chronological order
   */
  async getChatHistory(userId, conversationId, limit = 50) {
    try {
      const chatKey = this.getChatHistoryKey(userId, conversationId);
      const messages = await this.redis.lrange(chatKey, 0, limit - 1);
      
      const parsedMessages = messages
        .map(msg => {
          try {
            return JSON.parse(msg);
          } catch (e) {
            console.warn('Failed to parse message:', msg);
            return null;
          }
        })
        .filter(Boolean)
        .reverse(); // Reverse to get chronological order

      console.log(`📖 Retrieved ${parsedMessages.length} messages for ${userId}/${conversationId}`);
      return parsedMessages;

    } catch (error) {
      console.error('❌ Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Get message count for a conversation
   * @param {string} userId - User identifier
   * @param {string} conversationId - Conversation identifier
   * @returns {Promise<number>} Number of messages
   */
  async getMessageCount(userId, conversationId) {
    try {
      const chatKey = this.getChatHistoryKey(userId, conversationId);
      return await this.redis.llen(chatKey);
    } catch (error) {
      console.error('❌ Error getting message count:', error);
      return 0;
    }
  }

  // === CONVERSATION MANAGEMENT ===

  /**
   * Get all conversations for a user
   * @param {string} userId - User identifier
   * @returns {Promise<Array>} Array of conversation objects
   */
  async getUserConversations(userId) {
    try {
      const conversationsKey = this.getUserConversationsKey(userId);
      const conversationIds = await this.redis.smembers(conversationsKey);
      
      const conversations = [];
      for (const conversationId of conversationIds) {
        const metaKey = this.getConversationMetaKey(userId, conversationId);
        const meta = await this.redis.hgetall(metaKey);
        
        if (meta && Object.keys(meta).length > 0) {
          conversations.push({
            id: conversationId,
            ...meta,
            messageCount: parseInt(meta.messageCount) || 0
          });
        }
      }

      // Sort by last activity (most recent first)
      conversations.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      
      console.log(`📋 Found ${conversations.length} conversations for user ${userId}`);
      return conversations;

    } catch (error) {
      console.error('❌ Error getting user conversations:', error);
      return [];
    }
  }

  /**
   * Delete a conversation
   * @param {string} userId - User identifier
   * @param {string} conversationId - Conversation identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteConversation(userId, conversationId) {
    try {
      const pipeline = this.redis.pipeline();
      
      // Delete conversation data
      pipeline.del(this.getChatHistoryKey(userId, conversationId));
      pipeline.del(this.getConversationMetaKey(userId, conversationId));
      pipeline.del(this.getConversationSummaryKey(userId, conversationId));
      
      // Remove from user's conversation list
      pipeline.srem(this.getUserConversationsKey(userId), conversationId);
      
      await pipeline.exec();
      
      console.log(`🗑️ Deleted conversation: ${userId}/${conversationId}`);
      return true;

    } catch (error) {
      console.error('❌ Error deleting conversation:', error);
      return false;
    }
  }

  // === LONG-TERM MEMORY MANAGEMENT ===

  /**
   * Store important information in user's long-term memory
   * @param {string} userId - User identifier
   * @param {string} key - Memory key
   * @param {*} value - Value to store
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<boolean>} Success status
   */
  async storeMemory(userId, key, value, metadata = {}) {
    try {
      const memoryKey = this.getUserMemoryKey(userId);
      const memoryEntry = {
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : value,
        timestamp: new Date().toISOString(),
        metadata
      };

      await this.redis.hset(memoryKey, key, JSON.stringify(memoryEntry));
      await this.redis.expire(memoryKey, this.MEMORY_TTL);

      console.log(`🧠 Stored memory: ${userId}/${key}`);
      return true;

    } catch (error) {
      console.error('❌ Error storing memory:', error);
      return false;
    }
  }

  /**
   * Retrieve a specific memory
   * @param {string} userId - User identifier
   * @param {string} key - Memory key
   * @returns {Promise<*>} Memory value or null
   */
  async getMemory(userId, key) {
    try {
      const memoryKey = this.getUserMemoryKey(userId);
      const memoryData = await this.redis.hget(memoryKey, key);
      
      if (!memoryData) return null;

      const parsed = JSON.parse(memoryData);
      
      // Try to parse value if it's JSON
      try {
        parsed.value = JSON.parse(parsed.value);
      } catch (e) {
        // Value is not JSON, keep as string
      }

      console.log(`🧠 Retrieved memory: ${userId}/${key}`);
      return parsed;

    } catch (error) {
      console.error('❌ Error getting memory:', error);
      return null;
    }
  }

  /**
   * Get all memories for a user
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} Object with all user memories
   */
  async getAllMemories(userId) {
    try {
      const memoryKey = this.getUserMemoryKey(userId);
      const allMemories = (await this.redis.hgetall(memoryKey)) || {};
      
      const parsedMemories = {};
      for (const [key, value] of Object.entries(allMemories)) {
        try {
          const parsed = JSON.parse(value);
          try {
            parsed.value = JSON.parse(parsed.value);
          } catch (e) {
            // Value is not JSON, keep as string
          }
          parsedMemories[key] = parsed;
        } catch (e) {
          console.warn(`Failed to parse memory ${key}:`, value);
        }
      }

      console.log(`🧠 Retrieved ${Object.keys(parsedMemories).length} memories for user ${userId}`);
      return parsedMemories;

    } catch (error) {
      console.error('❌ Error getting all memories:', error);
      return {};
    }
  }

  /**
   * Search memories by keyword or pattern
   * @param {string} userId - User identifier
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching memories
   */
  async searchMemories(userId, query) {
    try {
      const allMemories = await this.getAllMemories(userId);
      const queryLower = query.toLowerCase();
      
      const matches = [];
      for (const [key, memory] of Object.entries(allMemories)) {
        const keyMatch = key.toLowerCase().includes(queryLower);
        const valueMatch = JSON.stringify(memory.value).toLowerCase().includes(queryLower);
        const metadataMatch = JSON.stringify(memory.metadata).toLowerCase().includes(queryLower);
        
        if (keyMatch || valueMatch || metadataMatch) {
          matches.push({ key, ...memory });
        }
      }

      console.log(`🔍 Found ${matches.length} memory matches for "${query}"`);
      return matches;

    } catch (error) {
      console.error('❌ Error searching memories:', error);
      return [];
    }
  }

  // === CONVERSATION SUMMARIZATION ===

  /**
   * Store a conversation summary
   * @param {string} userId - User identifier
   * @param {string} conversationId - Conversation identifier
   * @param {string} summary - Conversation summary
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<boolean>} Success status
   */
  async storeConversationSummary(userId, conversationId, summary, metadata = {}) {
    try {
      const summaryKey = this.getConversationSummaryKey(userId, conversationId);
      const summaryData = {
        summary,
        timestamp: new Date().toISOString(),
        metadata,
        conversationId,
        userId
      };

      await this.redis.set(summaryKey, JSON.stringify(summaryData));
      await this.redis.expire(summaryKey, this.MEMORY_TTL);

      console.log(`📝 Stored conversation summary: ${userId}/${conversationId}`);
      return true;

    } catch (error) {
      console.error('❌ Error storing conversation summary:', error);
      return false;
    }
  }

  /**
   * Get conversation summary
   * @param {string} userId - User identifier
   * @param {string} conversationId - Conversation identifier
   * @returns {Promise<Object|null>} Summary object or null
   */
  async getConversationSummary(userId, conversationId) {
    try {
      const summaryKey = this.getConversationSummaryKey(userId, conversationId);
      const summaryData = await this.redis.get(summaryKey);
      
      if (!summaryData) return null;

      const parsed = JSON.parse(summaryData);
      console.log(`📝 Retrieved conversation summary: ${userId}/${conversationId}`);
      return parsed;

    } catch (error) {
      console.error('❌ Error getting conversation summary:', error);
      return null;
    }
  }

  // === UTILITY METHODS ===

  /**
   * Clean up old conversations and memories
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} Cleanup stats
   */
  async cleanupUserData(userId) {
    try {
      const conversations = await this.getUserConversations(userId);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      let deletedConversations = 0;
      
      for (const conversation of conversations) {
        const lastActivity = new Date(conversation.lastActivity);
        if (lastActivity < thirtyDaysAgo) {
          await this.deleteConversation(userId, conversation.id);
          deletedConversations++;
        }
      }

      console.log(`🧹 Cleanup completed for ${userId}: ${deletedConversations} conversations deleted`);
      return {
        deletedConversations,
        remainingConversations: conversations.length - deletedConversations
      };

    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      return { deletedConversations: 0, remainingConversations: 0 };
    }
  }

  /**
   * Get user statistics
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} User stats
   */
  async getUserStats(userId) {
    try {
      const conversations = await this.getUserConversations(userId);
      const memories = await this.getAllMemories(userId);
      
      const totalMessages = conversations.reduce((sum, conv) => sum + conv.messageCount, 0);
      const lastActivity = conversations.length > 0 ? conversations[0].lastActivity : null;

      return {
        totalConversations: conversations.length,
        totalMessages,
        totalMemories: Object.keys(memories).length,
        lastActivity,
        conversations: conversations.slice(0, 10) // Recent 10 conversations
      };

    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      return {
        totalConversations: 0,
        totalMessages: 0,
        totalMemories: 0,
        lastActivity: null,
        conversations: []
      };
    }
  }

  /**
   * Test Redis connection
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      const testKey = 'connection_test';
      await this.redis.set(testKey, 'ok', { ex: 10 });
      const result = await this.redis.get(testKey);
      await this.redis.del(testKey);
      
      console.log('✅ Redis connection test successful');
      return result === 'ok';

    } catch (error) {
      console.error('❌ Redis connection test failed:', error);
      return false;
    }
  }
}

export default JotiumMemory;
