# WarpMind

JavaScript library for AI integration in web browsers. Single-file import, works with https://warp.cs.au.dk/mind.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [Core Methods](#core-methods)
- [Multi-Modal Processing](#multi-modal-processing)
- [PDF Processing](#pdf-processing)
- [Memory System](#memory-system)
- [Custom Tool Integration](#custom-tool-integration)
- [Structured Data Processing](#structured-data-processing)
- [Error Handling](#error-handling)
- [API Key Management](#api-key-management)
- [Development](#development)
- [License](#license)

## Quick Start

Include the library and initialize:

```html
<!DOCTYPE html>
<html>
<head>
    <title>AI Integration Example</title>
</head>
<body>
    <button onclick="askAI()">Test AI</button>
    <div id="response"></div>

    <!-- Include WarpMind library -->
    <script src="https://warp.cs.au.dk/libs/warpmind.js"></script>
    <!-- Or use local file: <script src="warpmind.js"></script> -->
    
    <script>
        const mind = new WarpMind({
            baseURL: 'https://warp.cs.au.dk/mind/',
            apiKey: 'your-auth-key'
        });

        async function askAI() {
            const response = await mind.chat("Explain machine learning in one sentence.");
            document.getElementById('response').textContent = response;
        }
    </script>
</body>
</html>
```

## Examples

The `examples/` directory contains interactive demonstrations:

- **`memory-demo.html`** - Full memory system UI with storage, search, management, and memory tool chat
- **`memory-tool-demo.html`** - Standalone demo showing automatic memory-tool activation
- **`chat-interface.html`** - Complete chat interface with streaming responses  
- **`pdf-reader-demo.html`** - PDF analysis and semantic search
- **`basic-example.html`** - Simple getting started example
- **`complete-test-suite.html`** - Comprehensive feature testing

To run examples with a local server (required for CORS):

```bash
npm run serve
# Then open http://localhost:8080/examples/memory-demo.html
```

## Configuration Options

Create a new WarpMind instance with these configuration options:

| Option | Type | Default | Description | Return Type |
|--------|------|---------|-------------|-------------|
| `baseURL` | string | Required | API endpoint URL | - |
| `apiKey` | string | Optional | Authentication key (prompted if missing) | - |
| `model` | string | `'gpt-4o'` | AI model to use | - |
| `temperature` | number | `0.7` | Response creativity (0-2) | - |
| `timeoutMs` | number | `30000` | Request timeout in milliseconds | - |
| `memoryToolEnabled` | boolean | `true` | Enable automatic memory tool | - |
| `memoryToolExplicitOnly` | boolean | `true` | Only use memory when explicitly requested | - |
| `memoryToolMaxResults` | number | `5` | Maximum memories per search | - |

```javascript
const mind = new WarpMind({
    baseURL: 'https://warp.cs.au.dk/mind/',  // API endpoint
    apiKey: 'your-auth-key',                 // Authentication
    model: 'gpt-4o',                         // Model selection
    temperature: 0.7,                        // Response creativity (0-2)
    timeoutMs: 30000                         // Request timeout
});

// Runtime configuration changes
mind.setApiKey('new-auth-key');
mind.setBaseURL('https://warp.cs.au.dk/mind/');
mind.setModel('gpt-4o');
```

### Token Usage Tracking

Monitor API usage by including usage information in responses:

```javascript
const response = await mind.chat("Explain photosynthesis", { includeUsage: true });
console.log('Response:', response.text);
console.log('Tokens used:', response.usage);
```

## Core Methods

### `chat(message, options)` → string | object

Primary communication method. Supports single messages and conversation history:

```javascript
// Simple query
const response = await mind.chat("Explain photosynthesis");

// Conversation context
const conversation = [
    { role: 'system', content: 'You are a programming tutor' },
    { role: 'user', content: 'What is a for loop?' },
    { role: 'assistant', content: 'A for loop iterates...' },
    { role: 'user', content: 'Show me an example' }
];
const response = await mind.chat(conversation);
```

Message roles:
- `system`: Instructions for AI behavior
- `user`: Human input
- `assistant`: Previous AI responses

### `streamChat(message, onChunk, options)` → void

Real-time response streaming:

```javascript
let fullResponse = '';
await mind.streamChat("Write a short story", (chunk) => {
    fullResponse += chunk.content;
    document.getElementById('output').textContent = fullResponse;
});
```

### `complete(prompt, options)` → string

Text completion:

```javascript
const response = await mind.complete("The three laws of robotics are");
```

## Multi-Modal Processing

### Image Analysis

Process images with AI vision models:

```javascript
// From file input
const imageFile = document.getElementById('imageInput').files[0];
const description = await mind.analyzeImage(imageFile, "Describe this image");

// From URL (must be direct image URL)
const analysis = await mind.analyzeImage(
    'https://example.com/photo.jpg',
    'What emotions are shown?',
    { 
        detail: 'high',        // 'low' (default) or 'high' (2x tokens)
        timeoutMs: 45000
    }
);

// Usage tracking
const result = await mind.analyzeImage(imageFile, "Analyze this graph", { 
    detail: 'high', 
    includeUsage: true 
});
```

**Note**: When using URLs, provide direct links to image files (`.jpg`, `.png`, `.gif`, `.webp`). Page URLs containing images won't work.

### `textToSpeech(text, options)` → Blob

Convert text to audio:

```javascript
// Basic synthesis
const audioBlob = await mind.textToSpeech("Hello, world!");
await mind.playAudio(audioBlob);

// Advanced options
const speech = await mind.textToSpeech("Welcome to AI programming!", {
    voice: 'nova',        // 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
    speed: 1.2,           // 0.25 to 4.0
    timeoutMs: 45000
});

// Streaming audio
const streamingAudio = await mind.textToSpeech("Long text content", {
    voice: 'fable',
    stream: true,
    onChunk: (chunk) => {
        console.log('Audio chunk:', chunk.byteLength);
    }
});
```

### `speechToText(audioFile, options)` → string | object

Convert audio to text:

```javascript
// From file
const audioFile = document.getElementById('audioInput').files[0];
const transcription = await mind.speechToText(audioFile, {
    language: 'en',
    timeoutMs: 60000
});

// With usage tracking
const result = await mind.speechToText(audioFile, { 
    includeUsage: true 
});
console.log('Transcription:', result.text);
console.log('Processing cost:', result.usage);
```

### `createVoiceChat(systemPrompt, options)` → VoiceChat

Voice conversation interface:

```javascript
const voiceAssistant = mind.createVoiceChat(
    "You are a programming tutor. Keep responses under 30 seconds.",
    {
        autoSpeak: true,
        voice: 'nova',
        language: 'en'
    }
);

// Voice interaction
document.getElementById('talkButton').onclick = async () => {
    await voiceAssistant.startRecording();
    const result = await voiceAssistant.stopRecordingAndRespond();
    console.log('User:', result.userMessage);
    console.log('AI:', result.aiResponse);
};
```

## PDF Processing

Load and analyze PDF documents with semantic search capabilities.

### `readPdf(source, options)` → string

Load and analyze PDF documents with semantic search capabilities:

```javascript
// From file input
const fileInput = document.getElementById('pdfFile');
const pdfFile = fileInput.files[0];

const pdfId = await mind.readPdf(pdfFile, {
    id: 'research-paper',                     // Optional custom ID
    chunkTokens: 400,                        // Text chunk size
    embedModel: 'text-embedding-3-small',    // Embedding model
    onProgress: (progress) => console.log(`${Math.round(progress * 100)}%`)
});

// From URL (full URL)
const pdfId = await mind.readPdf('https://example.com/document.pdf');

// From relative URL (relative to your web page)
const pdfId = await mind.readPdf('documents/research-paper.pdf');
const pdfId = await mind.readPdf('./instrumental_interaction.pdf');
const pdfId = await mind.readPdf('/static/pdfs/document.pdf');
```

The library supports File objects from input elements and HTTP URLs (both absolute and relative to your web server).

### PDF Management

```javascript
// Check status
const isLoaded = await mind.isPdfRead('research-paper');

// List all PDFs
const pdfList = await mind.listReadPdfs();

// Storage information
const storageInfo = await mind.getPdfStorageInfo();

// Remove from storage
await mind.forgetPdf('research-paper');
```

### `recallPdf(pdfId)` → void

Load previously processed PDF into memory:

```javascript
// Load previously processed PDF into memory
await mind.recallPdf('research-paper');

// Now available for chat
const answer = await mind.chat("What were the key findings?");
```

### Chat Integration

Once loaded, PDFs automatically enable AI search tools:

```javascript
const answer = await mind.chat("What is the main conclusion?");
const summary = await mind.chat("Summarize the methodology");
```

### Structured Data Extraction

Extract structured information directly from loaded PDFs using the `process` method:

```javascript
// Load PDF first
await mind.readPdf('research-paper.pdf');
// or recall: await mind.recallPdf('paper-id');

// Extract data using "pdf" shorthand
const paperAnalysis = await mind.process(
    "Extract key information from this research paper",
    "pdf",
    {
        title: "Paper title",
        authors: "Array of author names",
        methodology: "Research methodology used",
        keyFindings: "Array of main findings",
        conclusions: "Main conclusions"
    }
);

// Focused extraction
const methodology = await mind.process(
    "Focus on the methodology section",
    "pdf",
    {
        method: "What method was applied",
        sampleSize: "Number of participants",
        procedure: "Step-by-step procedure"
    }
);

// With usage tracking
const result = await mind.process(
    "Extract author information", 
    "pdf", 
    { authors: "Array of author names", institution: "Research institution" },
    { includeUsage: true }
);
console.log('Data:', result.data);
console.log('Cost:', result.usage);
```

### Processing Pipeline

- **Text Extraction**: PDF.js-based text extraction
- **Semantic Chunking**: Embedding-based text segmentation
- **Storage**: IndexedDB caching for persistence

## Memory System

### `remember(text, options)` → object

Store information using semantic embeddings:

```javascript
// Store a memory with tags
const memory = await mind.remember("I love Italian food, especially carbonara", { 
    tags: ['food', 'preferences'] 
});
```

### `recall(query, options)` → array

Retrieve information using semantic search:

```javascript
// Search memories semantically
const foodMemories = await mind.recall("what do I like to eat", { limit: 5 });

// Search by keywords/tags
const workMemories = await mind.recall("meetings", { 
    useKeywordSearch: true,
    limit: 10 
});
```

### Memory Management

```javascript
// Get all memories
const allMemories = await mind.getMemories();

// Delete a memory
await mind.forget(memory.id);

// Export/import memories for backup
const exportData = await mind.exportMemories();
const importStats = await mind.importMemories(exportData);

// Export memories as downloadable file (browser only)
const result = await mind.exportMemoriesToFile({ 
    filename: 'my-memories.json',
    includeEmbeddings: false 
});
console.log(`Downloaded ${result.filename} with ${result.exported} memories`);

// Import memories from file picker (browser only)
const importResult = await mind.importMemoriesFromFile({
    merge: true,
    skipDuplicates: true
});
console.log(`Imported ${importResult.imported} memories from ${importResult.filename}`);
```

### Memory Tool Integration

The memory system includes an intelligent tool that automatically activates during conversations when you explicitly ask to remember or recall information:

```javascript
// The AI will automatically search your memories when you ask
const response = await mind.chat("What do you remember about my food preferences?");

// Or recall work-related information
const workInfo = await mind.chat("Can you recall my project deadlines?");

// General questions won't trigger memory search
const general = await mind.chat("What is the capital of France?");
```

**Memory Tool Configuration:**
```javascript
const mind = new WarpMind({
    memoryToolEnabled: true,        // Enable memory tool (default: true)
    memoryToolExplicitOnly: true,   // Only use when explicitly requested
    memoryToolMaxResults: 5         // Max memories per search
});
```

### Memory Storage

The memory system automatically handles:
- **Embedding Generation**: Converts text to semantic vectors
- **Cross-Platform Storage**: IndexedDB (browser) or in-memory (Node.js)
- **Similarity Search**: Finds relevant memories using cosine similarity
- **Keyword Fallback**: Falls back to tag/keyword search when embeddings fail
- **UUID Management**: Generates unique identifiers for each memory

### Try the Interactive Demo

Open `examples/memory-demo.html` in your browser to explore memory features with a full UI for managing memories, searching, and testing the memory tool chat functionality with different scenarios.

## Custom Tool Integration

Connect AI to custom functions. The AI automatically decides when to use your tools.

### `registerTool(toolConfig)` → void

Basic tool registration:

```javascript
mind.registerTool({
    name: 'getWeather',
    description: 'Get current weather for a city',
    parameters: {
        type: 'object',
        properties: {
            city: { type: 'string', description: 'City name' },
            units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
        },
        required: ['city']
    },
    handler: async (args) => {
        // Your implementation
        return {
            city: args.city,
            temperature: 22,
            condition: 'sunny'
        };
    }
});

// AI automatically uses tools when relevant
const response = await mind.chat("What's the weather in Tokyo?");
```

### Implementation Examples

```javascript
// Database integration
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
        const student = await database.getStudent(args.studentId);
        return student;
    }
});

// Local storage
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
```

### Method Compatibility

**Supports tools**: `chat()`, `analyzeImage()`, `process()`
**No tool support**: `streamChat()`, `complete()`, audio methods

## Structured Data Processing

### `process(prompt, source, schema, options)` → object

Extract and organize information using defined schemas:

```javascript
// Text analysis
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

// Contact extraction
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
```

### Process Features

- Schema validation and automatic retries
- JSON object output
- Usage tracking with `{ includeUsage: true }`
- Error handling and graceful degradation
- PDF processing with `"pdf"` shorthand (see PDF section)

```javascript
const result = await mind.process(
    "Extract info", 
    data, 
    schema, 
    { includeUsage: true }
);
console.log('Data:', result.data);
console.log('Cost:', result.usage);
```

## Error Handling

Retry logic and error management:

```javascript
try {
    const response = await mind.chat("Hello", { timeoutMs: 10000 });
} catch (error) {
    if (error.name === 'TimeoutError') {
        console.log('Request timeout - increase timeoutMs');
    } else if (error.message.includes('authentication')) {
        console.log('Check API key configuration');
    } else if (error.message.includes('429')) {
        console.log('Rate limited - automatic retry in progress');
    }
}
```

### Automatic Retries

- **Conditions**: HTTP 429, 502, 503, 524
- **Max attempts**: 5 retries
- **Backoff**: Exponential with jitter
- **Headers**: Respects `Retry-After`

### Common Issues

| Issue | Solution |
|-------|----------|
| Authentication failed | Verify `apiKey` and `baseURL` |
| Network error | Check proxy server |
| Timeout | Increase `timeoutMs` |
| Rate limited | Wait - automatic retries handle this |
| Image too large | Use `detail: 'low'` or compress |

## API Key Management

Key prompting and storage for browser applications:

```javascript
// No API key needed - will prompt automatically
const mind = new WarpMind({
    baseURL: 'https://warp.cs.au.dk/mind/',
    model: 'gpt-4o'
});

// First use prompts for key, subsequent visits load from localStorage
const response = await mind.chat("Hello");
```

### Key Management Methods

```javascript
WarpMind.setApiKey('new-key');           // Set and save
const saved = WarpMind.getSavedApiKey(); // Check if saved
WarpMind.clearSavedApiKey();             // Clear saved key
const key = await WarpMind.promptForApiKey(); // Force new prompt
```

## Core Capabilities

- **Text Chat** - Conversation with AI models
- **Memory System** - Semantic storage and retrieval with embeddings
- **Image Analysis** - Computer vision and image description
- **Voice Processing** - Speech-to-text and text-to-speech
- **PDF Analysis** - Document reading with semantic search
- **Tool Integration** - Connect AI to custom functions
- **Streaming** - Real-time response generation
- **Data Extraction** - Structured information processing

## Architecture

- **Size**: 368 KiB total, modular design
- **Dependencies**: None (works directly in browsers)
- **API**: RESTful integration with OpenAI-compatible endpoints
- **Storage**: IndexedDB for PDF caching
- **Networking**: Built-in retry logic and error handling

## Development

### Usage

1. Download `warpmind.js` from `dist/` folder
2. Include in HTML: `<script src="warpmind.js"></script>`
3. Initialize and use

### Building from Source

```bash
git clone <repository-url>
cd warpmind
npm install
npm run build    # Creates dist/warpmind.js
npm test         # Run test suite
```

### Project Structure

```
src/                     # Modular source code
├── warpmind.js         # Main library
├── core/               # HTTP client & retry logic
├── modules/            # Feature modules (audio, vision, data)
└── streaming/          # Real-time streaming

dist/warpmind.js        # Single built file (368 KiB)
examples/               # Working demonstrations
tests/                  # Test suite (71 tests)
```

## Quick Reference

### Essential Methods:
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

// PDF processing (shorthand)
const pdfData = await mind.process("Extract info", "pdf", schema)

// PDF management
await mind.readPdf(file)          // Load PDF
await mind.recallPdf("pdf-id")       // Recall from storage
await mind.listReadPdfs()         // List all PDFs
await mind.forgetPdf("pdf-id")    // Remove from storage

// Memory operations
await mind.remember("I love pizza", { tags: ['food'] })  // Store memory
const memories = await mind.recall("what do I like")     // Search memories
await mind.exportMemoriesToFile()                        // Download memories as JSON
await mind.importMemoriesFromFile()                      // Import memories from file picker
await mind.forget(memoryId)                              // Delete memory

// Register custom AI tools
mind.registerTool({ name: "myTool", description: "...", parameters: {...}, handler: async (args) => {...} })
```

### Common Options:
- `timeoutMs: 30000` - Request timeout in milliseconds
- `includeUsage: true` - Track token usage for cost monitoring
- `detail: 'high'` - High-detail image analysis (costs ~2x tokens)
- `stream: true` - Enable streaming for real-time responses
- `voice: 'nova'` - Choose TTS voice ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')

### Configuration:
```javascript
const mind = new WarpMind({
    baseURL: 'https://warp.cs.au.dk/mind/v1',  // Warp CS API endpoint
    apiKey: 'your-key',                        // Your API key
    model: 'gpt-4o',                           // AI model
    temperature: 0.7,                          // Creativity level
    timeoutMs: 30000                           // Default timeout
});
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---
