//backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import JotiumAgent from './jotium.js';

// Load environment variables
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Jotium Agent
let jotiumAgent;
try {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required in environment variables');
  }
  jotiumAgent = new JotiumAgent(process.env.GEMINI_API_KEY);
  console.log('🤖 Jotium Agent initialized successfully');
  
  // Test memory connection
  const memoryStatus = await jotiumAgent.testMemoryConnection();
  console.log(`🧠 Memory system: ${memoryStatus ? '✅ Connected' : '❌ Disconnected'}`);
} catch (error) {
  console.error('❌ Failed to initialize Jotium Agent:', error.message);
  process.exit(1);
}

// Middleware
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes

// Health check
app.get('/health', async (req, res) => {
  const memoryStatus = await jotiumAgent.testMemoryConnection();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agent: jotiumAgent.getAgentInfo(),
    memory: {
      connected: memoryStatus,
      status: memoryStatus ? 'operational' : 'disconnected'
    }
  });
});

// Get agent information
app.get('/api/agent/info', (req, res) => {
  try {
    const info = jotiumAgent.getAgentInfo();
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Single unified chat endpoint - handles text, images, and streaming with memory
app.post('/api/chat', upload.any(), async (req, res) => {
  try {
    const {
      message,
      options = {},
      stream = false,
      userId,
      conversationId,
      includeHistory = true,
      historyLimit = 10
    } = req.body;
    const imageFiles = req.files || [];

    if (!message && imageFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message or image is required'
      });
    }

    // Generate conversation ID if not provided
    const currentConversationId = conversationId || uuidv4();
    const currentUserId = userId || 'anonymous';

    // Prepare options for agent
    const agentOptions = {
      ...options,
      userId: currentUserId,
      conversationId: currentConversationId,
      includeHistory,
      historyLimit
    };

    // Handle streaming response
    if (stream) {
      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      console.log('🔄 Starting streaming response...');
      res.write(`data: ${JSON.stringify({
        type: 'status',
        message: 'Processing...',
        conversationId: currentConversationId
      })}\n\n`);

      try {
        let response;
        if (imageFiles.length > 0) {
          const text = message || 'Analyze this image and describe what you see.';
          const imageFile = imageFiles[0]; // Only process the first image for now
          console.log('🖼️ Processing image with streaming:', text.substring(0, 100) + '...');
          response = await jotiumAgent.processImageWithText(text, imageFile.path, imageFile.mimetype, agentOptions);

          // Clean up all uploaded image files
          setTimeout(() => {
            imageFiles.forEach(file => {
              fs.unlink(file.path, (err) => {
                if (err) console.error('Failed to delete uploaded file:', err);
                else console.log('🗑️ Cleaned up uploaded file:', file.filename);
              });
            });
          }, 5000);
        } else {
          console.log('💬 Processing text with streaming:', message.substring(0, 100) + '...');
          response = await jotiumAgent.generateResponse(message, agentOptions);
        }

        // Send the complete response
        res.write(`data: ${JSON.stringify({
          type: 'response',
          data: {
            ...response,
            conversationId: currentConversationId,
            userId: currentUserId
          }
        })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      } catch (error) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      }

      res.end();
      return;
    }

    // Handle regular response (non-streaming)
    console.log(imageFiles.length > 0 ? '🖼️ Processing image...' : '💬 Processing text message...');

    const startTime = Date.now();
    let response;

    if (imageFiles.length > 0) {
      const text = message || 'Analyze this image and describe what you see.';
      const imageFile = imageFiles[0]; // Only process the first image for now
      console.log('📁 Image file:', imageFile.filename);

      response = await jotiumAgent.processImageWithText(text, imageFile.path, imageFile.mimetype, agentOptions);

      // Clean up all uploaded image files after processing
      setTimeout(() => {
        imageFiles.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err) console.error('Failed to delete uploaded file:', err);
            else console.log('🗑️ Cleaned up uploaded file:', file.filename);
          });
        });
      }, 5000);

    } else {
      response = await jotiumAgent.generateResponse(message, agentOptions);
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Response generated in ${processingTime}ms`);

    res.json({
      success: true,
      data: {
        ...response,
        processingTime,
        conversationId: currentConversationId,
        userId: currentUserId,
        ...(imageFiles.length > 0 && {
          imageInfo: imageFiles.map(file => ({
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
          }))
        })
      }
    });

  } catch (error) {
    console.error('❌ Chat error:', error);

    // Clean up uploaded files on error
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error('Failed to delete uploaded file on error:', err);
        });
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Memory Management Routes

// Get user conversations
app.get('/api/memory/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const conversations = await jotiumAgent.getUserConversations(userId);
    
    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific conversation history
app.get('/api/memory/conversations/:userId/:conversationId', async (req, res) => {
  try {
    const { userId, conversationId } = req.params;
    const { limit = 50 } = req.query;
    
    const history = await jotiumAgent.getConversationHistory(userId, conversationId, parseInt(limit));
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete conversation
app.delete('/api/memory/conversations/:userId/:conversationId', async (req, res) => {
  try {
    const { userId, conversationId } = req.params;
    const success = await jotiumAgent.deleteConversation(userId, conversationId);
    
    res.json({
      success,
      message: success ? 'Conversation deleted successfully' : 'Failed to delete conversation'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Store user memory
app.post('/api/memory/store/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { key, value, metadata = {} } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Key and value are required'
      });
    }
    
    const success = await jotiumAgent.storeUserMemory(userId, key, value, metadata);
    
    res.json({
      success,
      message: success ? 'Memory stored successfully' : 'Failed to store memory'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user memory
app.get('/api/memory/get/:userId/:key', async (req, res) => {
  try {
    const { userId, key } = req.params;
    const memory = await jotiumAgent.getUserMemory(userId, key);
    
    res.json({
      success: true,
      data: memory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search user memories
app.get('/api/memory/search/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }
    
    const memories = await jotiumAgent.searchUserMemories(userId, query);
    
    res.json({
      success: true,
      data: memories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user stats
app.get('/api/memory/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const stats = await jotiumAgent.getUserStats(userId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Jotium Chat Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Agent info: http://localhost:${PORT}/api/agent/info`);
  console.log(`💬 Unified chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`   - Text: POST with { "message": "your text", "userId": "user123", "conversationId": "conv456" }`);
  console.log(`   - Image: POST with form-data (image + message + userId + conversationId)`);
  console.log(`   - Stream: POST with { "message": "your text", "stream": true, "userId": "user123" }`);
  console.log(`🧠 Memory endpoints:`);
  console.log(`   - GET /api/memory/conversations/:userId`);
  console.log(`   - GET /api/memory/conversations/:userId/:conversationId`);
  console.log(`   - DELETE /api/memory/conversations/:userId/:conversationId`);
  console.log(`   - POST /api/memory/store/:userId`);
  console.log(`   - GET /api/memory/get/:userId/:key`);
  console.log(`   - GET /api/memory/search/:userId?query=...`);
  console.log(`   - GET /api/memory/stats/:userId`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Jotium Chat Backend...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Jotium Chat Backend...');
  process.exit(0);
});
