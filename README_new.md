# Warpmind

A JavaScript library for AI integration designed for browser environments. Works directly in browsers with no complex setup - just include one file and start building AI-powered applications with https://warp.cs.au.dk/mind.

## What Can You Build?

- **Chatbots** - Create conversational AI assistants
- **Image Analysis** - Build apps that can "see" and describe photos
- **Voice Interfaces** - Add speech recognition and text-to-speech
- **Smart Tools** - Let AI use custom functions you create
- **Data Processing** - Extract and structure information from text
- **Real-time Apps** - Stream AI responses as they're generated

## Key Features

- **No Installation** - Works directly in browsers, no npm or build tools required
- **Lightweight** - Only 16.1 KiB (smaller than most images!)
- **Multi-modal** - Text, images, voice, and custom tool support
- **Tool Calling** - Let AI use functions you write
- **Streaming** - Get responses in real-time as AI generates them
- **Auto-retry** - Built-in error handling and automatic retries with exponential backoff
- **Usage Tracking** - Monitor token costs and usage
- **Performance** - Optimized for fast loading and responsive interfaces

## Quick Start

### Step 1: Get the Library

Download `warpmind.js` from the `dist/` folder and include it in your HTML:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My AI App</title>
</head>
<body>
    <h1>My First AI Chat</h1>
    <button onclick="askAI()">Ask AI a Question</button>
    <div id="response"></div>

    <!-- Include Warpmind (only line you need!) -->
    <script src="warpmind.js"></script>
    
    <script>
        // Initialize with warp.cs.au.dk/mind
        const mind = new Warpmind({
            baseURL: 'https://warp.cs.au.dk/mind/',
            apiKey: 'your-auth-key'
        });

        async function askAI() {
            const response = await mind.chat("What is machine learning?");
            document.getElementById('response').textContent = response;
        }
    </script>
</body>
</html>
```

### Step 2: Configure and Start Building

The library is now ready to use with https://warp.cs.au.dk/mind. You can start building more complex AI applications using the methods documented below.

## Configuration

### Simple Setup

```javascript
const mind = new Warpmind({
    baseURL: 'https://warp.cs.au.dk/mind/',  // Warp CS API endpoint
    apiKey: 'your-auth-key',                   // Your API key
    model: 'gpt-3.5-turbo',                    // AI model to use
    temperature: 0.7,                          // Creativity (0 = precise, 2 = creative)
    timeoutMs: 30000                           // Timeout in milliseconds (default: 30 seconds)
});
```

### Changing Settings Later

```javascript
mind.setApiKey('new-auth-key');
mind.setBaseURL('https://warp.cs.au.dk/mind/');
mind.setModel('gpt-4');
```

### Usage Information & Token Tracking

All methods support tracking AI token usage for monitoring costs:

```javascript
// Simple usage tracking
const response = await mind.chat("Explain photosynthesis", { includeUsage: true });
console.log('Response:', response.text);
console.log('Tokens used:', response.usage);

// Usage tracking with images (images typically use more tokens)
const analysis = await mind.analyzeImage(imageFile, "What's in this image?", { 
    includeUsage: true 
});
console.log('Analysis:', analysis.text);
console.log('Tokens used:', analysis.usage);
```

## Basic Chat Methods

### `chat(message, options)`
The main method for talking to AI. Super flexible!

```javascript
// Simple question
const response = await mind.chat("Explain photosynthesis");

// Conversation with history (the AI remembers context!)
const conversation = [
    { role: 'system', content: 'You are a helpful programming tutor' },
    { role: 'user', content: 'What is a for loop?' },
    { role: 'assistant', content: 'A for loop is...' },
    { role: 'user', content: 'Can you show me an example?' }
];
const response = await mind.chat(conversation);

// Understanding message roles:
// 'system' = Instructions for how AI should behave
// 'user' = What the human says
// 'assistant' = What the AI said before
```

### `streamChat(message, onChunk, options)`
Get responses word-by-word as AI generates them (like ChatGPT!)

```javascript
let fullResponse = '';
await mind.streamChat("Write a short story", (chunk) => {
    fullResponse += chunk.content;
    document.getElementById('story').textContent = fullResponse;
});
```

### `complete(prompt, options)`
Simple text completion

```javascript
const response = await mind.complete("The three laws of robotics are");
```

## Multi-Modal Features (Images & Voice)

### Image Analysis with `analyzeImage(image, prompt, options)`

Make AI that can "see" and understand images!

```javascript
// Analyze uploaded image
const imageFile = document.getElementById('imageInput').files[0];
const description = await mind.analyzeImage(imageFile, "What's in this image?");

// Analyze image from URL
const analysis = await mind.analyzeImage(
    'https://example.com/photo.jpg',
    'Describe the emotions in this photo',
    { 
        detail: 'high',        // 'low' (default, faster) or 'high' (more detailed, costs ~2x tokens)
        timeoutMs: 45000       // Longer timeout for complex image analysis
    }
);

// Creative applications
const meme = await mind.analyzeImage(imageFile, "Create a funny caption for this image");
const code = await mind.analyzeImage(codeScreenshot, "Explain what this code does");

// With usage tracking
const result = await mind.analyzeImage(imageFile, "Analyze this graph", { 
    detail: 'high', 
    includeUsage: true 
});
console.log('Analysis:', result.text);
console.log('Tokens used:', result.usage); // High detail images use more tokens!
```

**Important**: The `detail: 'high'` option provides more detailed analysis but uses approximately 2× the tokens (costs more).

### Text-to-Speech with `textToSpeech(text, options)`

Make AI that can talk!

```javascript
// Basic speech
const audioBlob = await mind.textToSpeech("Hello, developers!");
await mind.playAudio(audioBlob);  // Built-in audio player

// Advanced options
const speech = await mind.textToSpeech("Welcome to AI programming!", {
    voice: 'nova',        // Voices: 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
    speed: 1.2,           // Speed: 0.25 to 4.0
    timeoutMs: 45000      // Longer timeout for long text
});

// Streaming audio (get chunks as they're generated)
const streamingAudio = await mind.textToSpeech("This is a longer text that will stream", {
    voice: 'fable',
    speed: 0.9,
    stream: true,         // Enable streaming
    onChunk: (chunk) => {
        // Handle streaming audio chunks as they arrive
        console.log('Audio chunk received, size:', chunk.byteLength);
        // You can play chunks immediately for lower latency
    }
});

// Create AI narrator for your projects!
const story = await mind.chat("Tell a 30-second adventure story");
const narration = await mind.textToSpeech(story, { voice: 'fable', speed: 0.9 });
await mind.playAudio(narration);
```

### Speech-to-Text with `speechToText(audioFile, options)`

Make AI that can listen!

```javascript
// Transcribe uploaded audio
const audioFile = document.getElementById('audioInput').files[0];
const transcription = await mind.speechToText(audioFile, {
    language: 'en',           // Language code (en, es, fr, etc.)
    timeoutMs: 60000          // Longer timeout for large audio files
});

console.log('Transcription:', transcription);

// With streaming for real-time feedback
const streamResult = await mind.speechToText(audioFile, {
    language: 'en',
    stream: true,             // Enable simulated streaming for better UX
    onPartial: (partialText) => {
        // Show live transcription as it processes
        document.getElementById('live-text').textContent = partialText;
    }
});

// Usage tracking for audio transcription
const result = await mind.speechToText(audioFile, { 
    includeUsage: true 
});
console.log('Final transcription:', result.text);
console.log('Audio processing cost:', result.usage);
```

### Voice Chat with `createVoiceChat(systemPrompt, options)`

Create voice conversations with AI!

```javascript
// Create a voice tutor
const voiceTutor = mind.createVoiceChat(
    "You are a helpful assistant. Keep responses under 30 seconds.",
    {
        autoSpeak: true,     // AI automatically speaks responses
        voice: 'nova',
        language: 'en',
        timeoutMs: 45000     // Longer timeout for voice processing
    }
);

// Start voice interaction
document.getElementById('talkButton').onclick = async () => {
    await voiceTutor.startRecording();
    // User speaks...
    const result = await voiceTutor.stopRecordingAndRespond();
    
    console.log('You said:', result.userMessage);
    console.log('AI replied:', result.aiResponse);
    // AI response is automatically spoken if autoSpeak: true
};

// Voice chat also supports .abort() method
document.getElementById('stopButton').onclick = () => {
    voiceTutor.abort(); // Stops recording and any ongoing processing
};
```

## Tool Calling - Let AI Use Your Functions

This is where it gets really cool! You can teach AI how to use JavaScript functions you write. The AI will automatically decide when and how to call your functions to help answer questions.

### `registerTool(toolDefinition)`

```javascript
// Register a weather lookup tool
mind.registerTool({
    name: 'getWeather',
    description: 'Get current weather for any city',
    parameters: {
        type: 'object',
        properties: {
            city: { type: 'string', description: 'The city name' },
            units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
        },
        required: ['city']
    },
    handler: async (args) => {
        // Your function that actually gets weather
        // This could call a real weather API
        return {
            city: args.city,
            temperature: 22,
            condition: 'sunny',
            units: args.units || 'celsius'
        };
    }
});

// Register a calculator tool
mind.registerTool({
    name: 'calculate',
    description: 'Perform mathematical calculations',
    parameters: {
        type: 'object',
        properties: {
            expression: { type: 'string', description: 'Math expression like "2 + 3 * 4"' }
        },
        required: ['expression']
    },
    handler: async (args) => {
        // Simple calculator (be careful with eval in real apps!)
        const result = eval(args.expression);
        return { expression: args.expression, result: result };
    }
});

// Now chat normally - AI will use tools when needed!
const response = await mind.chat("What's the weather in Tokyo and what's 15 * 23?");
// AI automatically calls getWeather('Tokyo') and calculate('15 * 23')
// Then gives you a natural language response with the results!
```

### Real-World Tool Examples

```javascript
// Database lookup tool
mind.registerTool({
    name: 'lookupStudent',
    description: 'Look up student information by ID',
    parameters: {
        type: 'object',
        properties: {
            studentId: { type: 'string', description: 'The student ID' }
        },
        required: ['studentId']
    },
    handler: async (args) => {
        // Connect to your database
        const student = await database.getStudent(args.studentId);
        return student;
    }
});

// File system tool
mind.registerTool({
    name: 'saveNote',
    description: 'Save a note to local storage',
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            content: { type: 'string' }
        },
        required: ['title', 'content']
    },
    handler: async (args) => {
        localStorage.setItem(`note_${args.title}`, args.content);
        return { saved: true, title: args.title };
    }
});

// API integration tool
mind.registerTool({
    name: 'searchNews',
    description: 'Search for recent news articles',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search terms' },
            limit: { type: 'number', description: 'Number of articles' }
        },
        required: ['query']
    },
    handler: async (args) => {
        const response = await fetch(`/api/news?q=${args.query}&limit=${args.limit || 5}`);
        return await response.json();
    }
});
```

### How Tool Calling Works

1. **You register tools** with `registerTool()`
2. **User asks a question** that might need your tools
3. **AI decides automatically** which tools to use (if any)
4. **AI calls your functions** with the right parameters
5. **AI uses the results** to give a complete answer

The AI is smart about when to use tools - it won't call them unnecessarily!

## Structured Data Processing

### `process(prompt, data, schema, options)`

Perfect for extracting and organizing information!

```javascript
// Analyze customer feedback
const feedback = "The app is amazing but crashes sometimes. Love the new dark mode!";
const analysis = await mind.process(
    "Analyze this feedback",
    feedback,
    {
        sentiment: "positive, negative, or neutral",
        issues: "array of problems mentioned",
        praise: "array of things they liked",
        confidence: "number from 0 to 1"
    }
);
// Returns: { sentiment: "positive", issues: ["crashes"], praise: ["dark mode"], confidence: 0.85 }

// Extract data from messy text
const contact = "Hi I'm Sarah Johnson, call me at 555-0123 or email sarah@university.edu";
const info = await mind.process(
    "Extract contact info",
    contact,
    {
        name: "person's full name",
        phone: "phone number",
        email: "email address"
    }
);
// Returns: { name: "Sarah Johnson", phone: "555-0123", email: "sarah@university.edu" }

// Process complex data
const grades = { midterm: 85, final: 92, assignments: [88, 94, 76, 89] };
const report = await mind.process(
    "Generate grade report",
    grades,
    {
        overallGrade: "calculated final grade",
        letterGrade: "A, B, C, D, or F",
        trend: "improving, declining, or stable",
        recommendation: "advice for student"
    }
);
```

The `process` method automatically:
- Validates responses match your schema  
- Retries up to 3 times if something goes wrong
- Returns clean JSON objects
- Handles errors gracefully
- Supports usage tracking with `{ includeUsage: true }`

```javascript
// Track tokens used in data processing
const result = await mind.process(
    "Extract contact info", 
    contactText, 
    contactSchema, 
    { includeUsage: true }
);
console.log('Extracted data:', result.data);
console.log('Processing cost:', result.usage);
```

## Error Handling & Troubleshooting

Warpmind includes automatic retry logic and helpful error messages:

```javascript
try {
    const response = await mind.chat("Hello", { timeoutMs: 10000 });
    console.log(response);
} catch (error) {
    if (error.name === 'TimeoutError') {
        console.log('Request took too long - try increasing timeoutMs');
    } else if (error.message.includes('authentication')) {
        console.log('Check your API key or proxy configuration');
    } else if (error.message.includes('Network')) {
        console.log('Check your internet connection or proxy server');
    } else if (error.message.includes('429')) {
        console.log('Rate limited - Warpmind will automatically retry');
    } else {
        console.log('Error:', error.message);
    }
}
```

### Automatic Retries

Warpmind automatically retries failed requests with exponential backoff:
- **Retry conditions**: HTTP status codes 429, 502, 503, 524
- **Max attempts**: 5 retries  
- **Backoff formula**: `500ms × 2^attempt + random(0-250ms)`
- **Header respect**: Uses `Retry-After` header when provided by server

### Common Issues & Solutions

| Problem | Solution |
|---------|----------|
| "Authentication failed" | Check your `apiKey` and `baseURL` settings |
| "Network error" | Verify your proxy server is running |
| "Timeout" | Increase `timeoutMs` in options |
| "Rate limited" | Wait a moment - automatic retries will handle this |
| "Image too large" | Compress image or use `detail: 'low'` |
| Voice not working | Check browser permissions for microphone |

## Development & Building

### For Users (Just Use It!)

You don't need to build anything! Just:
1. Download `warpmind.js` from the `dist/` folder
2. Include it in your HTML with `<script src="warpmind.js"></script>`
3. Start coding!

### For Advanced Users & Contributors

If you want to modify the library or contribute:

```bash
# Clone or download the repository
git clone <repository-url>
cd warpmind

# Install development dependencies
npm install

# Build the library (creates dist/warpmind.js)
npm run build

# Run tests to make sure everything works
npm test
```

### Project Structure

```
warpmind/
├── src/                    # Source code (modular)
│   ├── warpmind.js        # Main library (284 lines)
│   ├── util.js            # Utility functions
│   ├── core/              
│   │   └── base-client.js # HTTP client & retry logic
│   ├── modules/           # Feature modules
│   │   ├── audio.js       # Voice & speech features
│   │   ├── vision.js      # Image analysis
│   │   └── data-processing.js # Structured data
│   └── streaming/
│       └── sse-parser.js  # Real-time streaming
├── dist/
│   └── warpmind.js        # Built library (single file, 16.1 KiB)
├── examples/              # Working demos (start here!)
├── tests/                 # Node.js tests (71 tests)
├── docs/                  # Documentation
├── package.json           # Node.js configuration
├── webpack.config.js      # Build configuration
└── README.md             # This file!
```

### Why This Structure?

- **`src/`** - Modular source code for maintainability
- **`dist/`** - Single built file that users actually use
- **`examples/`** - Real working examples to learn from
- **`tests/`** - Comprehensive test suite (71 tests, all passing)

This lets advanced users work on the modular source code while keeping it simple for users who just want to use the library!

## License

MIT License - Feel free to use this in your projects and assignments!

## Acknowledgements

- Development of this library was assisted by Claude Sonnet 4 through GitHub Copilot
- Built for developers learning AI programming

## Quick Reference

### Essential Methods
```javascript
// Basic chat
await mind.chat("Hello world")

// Image analysis  
await mind.analyzeImage(imageFile, "What's in this image?")

// Voice synthesis
const audio = await mind.textToSpeech("Hello!")
await mind.playAudio(audio)

// Voice recognition
const text = await mind.speechToText(audioFile)

// Structured data processing
const result = await mind.process("Extract info", data, schema)

// Register custom AI tools
mind.registerTool({ name: "myTool", description: "...", parameters: {...}, handler: async (args) => {...} })
```

### Common Options
- `timeoutMs: 30000` - Request timeout in milliseconds
- `includeUsage: true` - Track token usage for cost monitoring
- `detail: 'high'` - High-detail image analysis (costs ~2x tokens)
- `stream: true` - Enable streaming for real-time responses
- `voice: 'nova'` - Choose TTS voice ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')

### Configuration
```javascript
const mind = new Warpmind({
    baseURL: 'https://warp.cs.au.dk/mind/v1',  // Warp CS API endpoint
    apiKey: 'your-key',                        // Your API key
    model: 'gpt-3.5-turbo',                    // AI model
    temperature: 0.7,                          // Creativity level
    timeoutMs: 30000                           // Default timeout
});
```

---
