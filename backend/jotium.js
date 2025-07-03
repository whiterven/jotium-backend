//backend/jotium.js
import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import { toolFunctions, tools } from './tools/index.js';
import JotiumMemory from './memory.js';

class JotiumAgent {
  constructor(apiKey) {
    this.ai = new GoogleGenAI({}); // Initialize without API key, it should be set via environment
    this.model = 'gemini-2.5-pro'; // Using pro for thinking capabilities
    this.memory = new JotiumMemory(); // Initialize memory system
    this.systemInstruction = `You are Jotium, an advanced AI assistant designed to be helpful, informative, and engaging. 

Core Capabilities:
- You can search the web for current information using DuckDuckGo
- You can provide current date and time information in various formats
- You can analyze and understand images when provided
- You can use multiple tools together to complete complex tasks
- You think through problems step by step before responding
- You have access to conversation history and can remember user preferences and important information

Memory & Context:
- You can access previous conversations and maintain context across sessions
- You can remember user preferences, important facts, and ongoing projects
- You can summarize long conversations for better context management
- Always consider relevant past context when responding

Personality & Communication:
- Be friendly, professional, and conversational
- Provide accurate, well-researched information
- When you don't know something recent, use web search to find current information
- Always cite your sources when using web search results
- Be concise but thorough in your explanations
- Show your reasoning process when solving complex problems
- Reference relevant past conversations when appropriate

Tool Usage Guidelines:
- Use web search for current events, recent information, or when you need to verify facts
- Use datetime tool when users ask about current time, dates, or need scheduling information
- For images, analyze them thoroughly and provide detailed descriptions
- Always explain what tools you're using and why

Remember: You're here to assist users with any questions or tasks they might have. Be proactive in offering help and suggestions based on conversation history and user preferences.`;
  }

  /**
   * Generate a response using the Jotium agent with memory context
   * @param {string|Array} input - Text input or array of content parts
   * @param {Object} options - Additional options
   * @returns {Object} Response with text, thoughts, and tool calls
   */
  async generateResponse(input, options = {}) {
    try {
      const { userId, conversationId, includeHistory = true, historyLimit = 10 } = options;

      let contents;
      let contextMessages = [];

      // Get conversation history if user and conversation IDs are provided
      if (userId && conversationId && includeHistory) {
        try {
          contextMessages = await this.memory.getChatHistory(userId, conversationId, historyLimit);
          console.log(`📚 Retrieved ${contextMessages.length} previous messages for context`);
        } catch (error) {
          console.warn('⚠️ Failed to retrieve chat history:', error.message);
        }
      }

      // Handle different input types
      if (typeof input === 'string') {
        contents = [{
          role: 'user',
          parts: [{ text: input }]
        }];
      } else if (Array.isArray(input)) {
        contents = input;
      } else {
        throw new Error('Invalid input format');
      }

      // Add conversation history to context if available
      if (contextMessages.length > 0) {
        const historyContents = contextMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));
        
        // Insert history before the current message
        contents = [...historyContents, ...contents];
      }

      // Get user memories for additional context
      let userMemories = {};
      if (userId) {
        try {
          userMemories = await this.memory.getAllMemories(userId);
          if (Object.keys(userMemories).length > 0) {
            const memoryContext = this.formatMemoriesForContext(userMemories);
            // Add memory context to system instruction
            const enhancedSystemInstruction = `${this.systemInstruction}\n\nRelevant User Information:\n${memoryContext}`;
            this.systemInstruction = enhancedSystemInstruction;
          }
        } catch (error) {
          console.warn('⚠️ Failed to retrieve user memories:', error.message);
        }
      }

      const config = {
        systemInstruction: this.systemInstruction,
        temperature: options.temperature || 0.3,
        tools: tools,
        thinkingConfig: {
          includeThoughts: true,
        },
      };

      let thoughts = '';
      let finalAnswer = '';
      let toolCalls = [];

      // Loop until the model has no more function calls to make
      while (true) {
        const result = await this.ai.models.generateContent({
          model: this.model,
          contents,
          config,
        });

        // Extract thoughts and regular content from the result
        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
          for (const part of result.candidates[0].content.parts) {
            if (!part.text) {
              continue;
            } else if (part.thought) {
              thoughts += part.text + '\n';
            } else {
              finalAnswer += part.text;
            }
          }
        }

        // Check for function calls in the result
        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
          const functionCalls = result.candidates[0].content.parts
            .filter(part => part.functionCall)
            .map(part => part.functionCall);

          if (functionCalls.length > 0) {
            const functionCall = functionCalls[0];
            const { name, args } = functionCall;

            if (!toolFunctions[name]) {
              throw new Error(`Unknown function call: ${name}`);
            }

            // Record the tool call
            toolCalls.push({
              name,
              args,
              timestamp: new Date().toISOString()
            });

            console.log(`🔧 Tool Call: ${name}(${JSON.stringify(args)})`);

            // Execute the function
            const toolResponse = await toolFunctions[name](args);
            
            console.log(`📊 Tool Response:`, toolResponse);

            const functionResponsePart = {
              name: functionCall.name,
              response: {
                result: toolResponse,
              },
            };

            // Add the function call and response to contents
            contents.push(result.candidates[0].content);
            contents.push({
              role: 'user',
              parts: [{ functionResponse: functionResponsePart }],
            });

          } else {
            // No more function calls, break the loop
            break;
          }
        } else {
          // No valid response structure, break the loop
          break;
        }
      }

      const response = {
        text: finalAnswer.trim(),
        thoughts: thoughts.trim(),
        toolCalls,
        timestamp: new Date().toISOString()
      };

      // Save the conversation to memory if user and conversation IDs are provided
      if (userId && conversationId) {
        try {
          // Save user message
          if (typeof input === 'string') {
            await this.memory.saveMessage(userId, conversationId, {
              role: 'user',
              content: input,
              timestamp: new Date().toISOString()
            });
          }

          // Save assistant response
          await this.memory.saveMessage(userId, conversationId, {
            role: 'assistant',
            content: response.text,
            timestamp: response.timestamp,
            metadata: {
              toolCalls: response.toolCalls,
              thoughts: response.thoughts
            }
          });

          console.log(`💾 Conversation saved to memory: ${userId}/${conversationId}`);
        } catch (error) {
          console.warn('⚠️ Failed to save conversation to memory:', error.message);
        }
      }

      return response;

    } catch (error) {
      console.error('Jotium Agent Error:', error);
      throw new Error(`Agent error: ${error.message}`);
    }
  }

  /**
   * Process image with text input and memory context
   * @param {string} text - Text prompt
   * @param {string} imagePath - Path to uploaded image
   * @param {string} mimeType - MIME type of the image
   * @param {Object} options - Additional options including userId and conversationId
   * @returns {Object} Response with image analysis
   */
  async processImageWithText(text, imagePath, mimeType, options = {}) {
    try {
      // Upload the image to Gemini
      const image = await this.ai.files.upload({
        file: imagePath,
      });

      const contents = [
        createUserContent([
          text,
          createPartFromUri(image.uri, image.mimeType || mimeType),
        ]),
      ];

      return await this.generateResponse(contents, options);

    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Store important information in user's memory
   * @param {string} userId - User identifier
   * @param {string} key - Memory key
   * @param {*} value - Value to store
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<boolean>} Success status
   */
  async storeUserMemory(userId, key, value, metadata = {}) {
    try {
      return await this.memory.storeMemory(userId, key, value, metadata);
    } catch (error) {
      console.error('Memory storage error:', error);
      return false;
    }
  }

  /**
   * Retrieve user memory
   * @param {string} userId - User identifier
   * @param {string} key - Memory key
   * @returns {Promise<*>} Memory value or null
   */
  async getUserMemory(userId, key) {
    try {
      return await this.memory.getMemory(userId, key);
    } catch (error) {
      console.error('Memory retrieval error:', error);
      return null;
    }
  }

  /**
   * Search user memories
   * @param {string} userId - User identifier
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching memories
   */
  async searchUserMemories(userId, query) {
    try {
      return await this.memory.searchMemories(userId, query);
    } catch (error) {
      console.error('Memory search error:', error);
      return [];
    }
  }

  /**
   * Get user's conversation history
   * @param {string} userId - User identifier
   * @param {string} conversationId - Conversation identifier
   * @param {number} limit - Number of messages to retrieve
   * @returns {Promise<Array>} Array of messages
   */
  async getConversationHistory(userId, conversationId, limit = 50) {
    try {
      return await this.memory.getChatHistory(userId, conversationId, limit);
    } catch (error) {
      console.error('Conversation history retrieval error:', error);
      return [];
    }
  }

  /**
   * Get all user conversations
   * @param {string} userId - User identifier
   * @returns {Promise<Array>} Array of conversations
   */
  async getUserConversations(userId) {
    try {
      return await this.memory.getUserConversations(userId);
    } catch (error) {
      console.error('User conversations retrieval error:', error);
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
      return await this.memory.deleteConversation(userId, conversationId);
    } catch (error) {
      console.error('Conversation deletion error:', error);
      return false;
    }
  }

  /**
   * Get user statistics
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} User stats
   */
  async getUserStats(userId) {
    try {
      return await this.memory.getUserStats(userId);
    } catch (error) {
      console.error('User stats retrieval error:', error);
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
   * Format memories for context inclusion
   * @param {Object} memories - User memories object
   * @returns {string} Formatted memory context
   */
  formatMemoriesForContext(memories) {
    const memoryEntries = Object.entries(memories)
      .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp))
      .slice(0, 10); // Limit to 10 most recent memories

    return memoryEntries
      .map(([key, memory]) => `- ${key}: ${JSON.stringify(memory.value)}`)
      .join('\n');
  }

  /**
   * Test memory system connection
   * @returns {Promise<boolean>} Connection status
   */
  async testMemoryConnection() {
    try {
      return await this.memory.testConnection();
    } catch (error) {
      console.error('Memory connection test error:', error);
      return false;
    }
  }

  /**
   * Get agent status and available tools
   * @returns {Object} Agent information
   */
  getAgentInfo() {
    return {
      name: 'Jotium',
      version: '1.0.0',
      model: this.model,
      capabilities: [
        'Text conversation',
        'Image analysis',
        'Web search',
        'Date/Time information',
        'Multi-tool task completion',
        'Step-by-step reasoning',
        'Conversation memory',
        'User preferences storage',
        'Context-aware responses'
      ],
      availableTools: Object.keys(toolFunctions),
      memoryFeatures: [
        'Chat history',
        'User memories',
        'Conversation management',
        'Context retrieval',
        'Memory search'
      ]
    };
  }
}

export default JotiumAgent;
