# Jotium Chat Backend

A Node.js Express backend for the Jotium chat application, powered by Google's Gemini AI with intelligent tool usage capabilities.

## Features

- 🤖 **Jotium AI Agent**: Intelligent conversational AI powered by Gemini 2.5 Pro
- 🛠️ **Multi-Tool Support**: Extensible tool system for enhanced capabilities
- 💭 **Thinking Process**: Shows AI reasoning and thought processes
- 🕒 **DateTime Tool**: Get current date/time in various formats and timezones
- 🔍 **Web Search Tool**: Search the web using DuckDuckGo for current information
- 💬 **Conversation Memory**: Maintains conversation history across sessions
- 🚀 **RESTful API**: Clean, well-documented API endpoints

## Tools Available

### 1. DateTime Tool (`get_current_datetime`)
- Get current date and time in various formats
- Support for different timezones
- Formats: full, date_only, time_only, iso, timestamp

### 2. Web Search Tool (`search_web`)
- Search the web using DuckDuckGo
- Get current information and news
- Configurable number of results (1-10)

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd jotium-chat-backend

# Install dependencies
npm install
```

### 2. Environment Setup

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your Google AI API key
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
PORT=3000
```

### 3. Get Google AI API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Copy the key to your `.env` file

### 4. Run the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Chat with Jotium
```http
POST /chat
Content-Type: application/json

{
  "message": "What's the current time in Tokyo?",
  "conversationId": "user123", // optional
  "includeHistory": true // optional, default: true
}
```

**Response:**
```json
{
  "success": true,
  "response": "The current time in Tokyo is...",
  "thoughts": ["I need to get the current time in Tokyo timezone..."],
  "toolsUsed": ["get_current_datetime"],
  "conversationId": "user123",
  "responseTime": 1250,
  "timestamp": "2025-07-02T12:00:00.000Z"
}
```

### Get Conversation History
```http
GET /conversation/:id
```

### Clear Conversation
```http
DELETE /conversation/:id
```

### List All Conversations
```http
GET /conversations
```

### Health Check
```http
GET /health
```

## Example Usage

### Basic Chat
```javascript
const response = await fetch('http://localhost:3000/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: "Hello Jotium! What can you do?"
  })
});

const data = await response.json();
console.log(data.response);
```

### Using Tools
```javascript
// DateTime tool usage
const timeResponse = await fetch('http://localhost:3000/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: "What time is it in New York right now?"
  })
});

// Web search tool usage
const searchResponse = await fetch('http://localhost:3000/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: "What's the latest news about AI developments?"
  })
});
```

## Adding New Tools

### 1. Create Tool File
Create a new file in the `tools/` directory:

```javascript
// tools/myTool.js
import { Type } from '@google/genai';

export const myToolFunctionDeclaration = {
  name: 'my_tool_function',
  description: 'Description of what this tool does',
  parameters: {
    type: Type.OBJECT,
    properties: {
      param1: {
        type: Type.STRING,
        description: 'Description of parameter',
      },
    },
    required: ['param1'],
  },
};

export function myToolFunction({ param1 }) {
  console.log(`Tool Call: my_tool_function(param1=${param1})`);
  
  try {
    // Your tool logic here
    const result = {
      success: true,
      data: `Processed: ${param1}`
    };
    
    console.log(`Tool Response: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    const errorResult = { error: `Tool failed: ${error.message}` };
    console.log(`Tool Response: ${JSON.stringify(errorResult)}`);
    return errorResult;
  }
}
```

### 2. Update Tools Index
Add your tool to `tools/index.js`:

```javascript
// Import your new tool
import { myToolFunctionDeclaration, myToolFunction } from './myTool.js';

// Add to tool declarations
export const toolDeclarations = [
  {
    functionDeclarations: [
      dateTimeFunctionDeclaration,
      webSearchFunctionDeclaration,
      myToolFunctionDeclaration, // Add here
    ],
  },
];

// Add to tool functions
export const toolFunctions = {
  get_current_datetime: getCurrentDateTime,
  search_web: searchWeb,
  my_tool_function: myToolFunction, // Add here
};
```

## Project Structure

```
jotium-chat-backend/
├── tools/                  # Tool definitions
│   ├── dateTime.js         # DateTime tool
│   ├── webSearch.js        # Web search tool
│   └── index.js            # Tools export
├── jotium.js              # Main Jotium agent class
├── server.js              # Express server
├── package.json           # Dependencies
├── .env.example           # Environment template
└── README.md              # This file
```

## Configuration

### Environment Variables

- `GEMINI_API_KEY` - Your Google AI API key (required)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Jotium Agent Configuration

The agent can be configured in `jotium.js`:

```javascript
const result = await this.ai.models.generateContentStream({
  model: "gemini-2.5-pro",        // Model to use
  contents,
  config: {
    systemInstruction: this.systemPrompt,
    temperature: 0.3,             // Response creativity (0-1)
    tools: toolDeclarations,      // Available tools
    thinkingConfig: {
      includeThoughts: true,      // Show thinking process
    },
  },
});
```

## Features in Detail

### Conversation Memory
- Maintains conversation history per session
- Configurable history length (default: 20 messages)
- Memory stored in-memory (use database for production)

### Tool System
- Modular tool architecture
- Easy to add new tools
- Automatic tool selection by AI
- Support for multiple tool calls per request

### Thinking Process
- Shows AI reasoning steps
- Helps understand decision making
- Optional feature (can be disabled)

### Error Handling
- Comprehensive error handling
- Graceful fallbacks
- Detailed error messages for debugging

## Production Considerations

### 1. Database Integration
Replace in-memory conversation storage with a database:

```javascript
// Example with MongoDB
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  id: String,
  messages: [{
    role: String,
    content: String,
    timestamp: Date
  }],
  lastActivity: Date
});
```

### 2. Rate Limiting
Add rate limiting to prevent abuse:

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/chat', limiter);
```

### 3. Authentication
Add user authentication:

```javascript
import jwt from 'jsonwebtoken';

const authenticateToken = (req, res, next) => {
  // JWT authentication logic
};

app.use('/chat', authenticateToken);
```

### 4. Logging
Add proper logging:

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

## API Response Examples

### Successful Chat Response
```json
{
  "success": true,
  "response": "Hello! I'm Jotium, your AI assistant. I can help you with various tasks including getting current date/time information, searching the web for up-to-date information, and having intelligent conversations. What would you like to know or discuss?",
  "thoughts": [
    "The user is greeting me and asking what I can do. I should introduce myself as Jotium and explain my capabilities including the tools I have access to."
  ],
  "toolsUsed": [],
  "conversationId": "default",
  "responseTime": 856,
  "timestamp": "2025-07-02T12:30:45.123Z"
}
```

### Tool Usage Response
```json
{
  "success": true,
  "response": "The current time in Tokyo is Wednesday, July 2, 2025 at 9:30:45 PM JST. Tokyo is currently in Japan Standard Time (JST), which is UTC+9.",
  "thoughts": [
    "The user is asking for the current time in Tokyo. I need to use the get_current_datetime tool with the Tokyo timezone to provide accurate information."
  ],
  "toolsUsed": ["get_current_datetime"],
  "conversationId": "user123",
  "responseTime": 1342,
  "timestamp": "2025-07-02T12:30:45.123Z"
}
```

### Error Response
```json
{
  "error": "Internal server error",
  "message": "Invalid API key provided",
  "timestamp": "2025-07-02T12:30:45.123Z"
}
```

## Troubleshooting

### Common Issues

1. **"Invalid API Key" Error**
   - Check that your Google AI API key is correctly set in `.env`
   - Ensure the API key has proper permissions

2. **Tool Not Working**
   - Verify tool is properly imported in `tools/index.js`
   - Check tool function syntax matches the declaration

3. **Memory Issues**
   - Conversation history grows over time
   - Consider implementing automatic cleanup
   - Use database for production deployments

4. **Slow Responses**
   - Gemini 2.5 Pro is slower but more capable
   - Consider using Gemini 2.5 Flash for faster responses
   - Implement response caching for repeated queries

### Debug Mode

Enable detailed logging by setting environment variable:
```bash
DEBUG=true npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your changes
4. Write tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

---

**Jotium** - Your intelligent AI assistant with tool capabilities! 🤖✨
