# WarpMind

JavaScript library for easy AI integration in web browsers. Designed to work with [OpenAI-Proxy](https://github.com/cklokmose/openai-proxy).

## Table of Contents

- [Core Capabilities](#core-capabilities)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [Configuration Options](#configuration-options)
- [Core Methods](#core-methods)
- [Responses API (New)](#responses-api-new)
- [Multi-Modal Processing](#multi-modal-processing)
- [Structured Data Processing](#structured-data-processing)
- [Memory System](#memory-system)
- [PDF Processing](#pdf-processing)
- [Custom Tool Integration](#custom-tool-integration)
- [Error Handling](#error-handling)
- [API Key Management](#api-key-management)
- [Architecture](#architecture)
- [Development](#development)
- [Quick Reference](#quick-reference)
- [Acknowledgement](#acknowledgement)
- [License](#license)

## Core Capabilities

- **Text Chat** - Conversation with AI models
- **Memory System** - Semantic storage and retrieval with embeddings
- **Image Analysis** - Computer vision and image description
- **Voice Processing** - Speech-to-text and text-to-speech
- **PDF Analysis** - Document reading with semantic search
- **Tool Integration** - Connect AI to custom functions
- **Streaming** - Real-time response generation
- **Data Extraction** - Structured information processing

## Quick Start

Include the library and initialize:

```html
<!DOCTYPE html>
<html>
<head>
    <title>WarpMind Integration Example</title>
</head>
<body>
    <button onclick="askAI()">Test WarpMind</button>
    <div id="response"></div>

    <!-- Include WarpMind library -->
    <script src="warpmind.js"></script>
    
    <script>
        const mind = new WarpMind({baseURL: 'https://my-openai-proxy.com'});

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

- **`responses-demo.html`** - **NEW**: Complete Responses API demo with streaming, conversations, tools, and background tasks
- **`memory-demo.html`** - Full memory system UI with storage, search, management, and memory tool chat
- **`memory-tool-demo.html`** - Standalone demo showing automatic memory-tool activation
- **`chat-interface.html`** - Complete chat interface with streaming responses  
- **`pdf-reader-demo.html`** - PDF analysis, semantic search, and export/import functionality
- **`basic-example.html`** - Simple getting started example
- **`complete-test-suite.html`** - Comprehensive feature testing

To run examples with a local server (required for CORS):

```bash
python3 -m http.server 3000
# Then open http://localhost:3000/examples/responses-demo.html
```

## Configuration Options

Create a new WarpMind instance with these configuration options:

| Option | Type | Default | Description | Return Type |
|--------|------|---------|-------------|-------------|
| `baseURL` | string | Required | API endpoint URL | - |
| `apiKey` | string | Optional | Authentication key (prompted if missing) | - |
| `model` | string | `'gpt-4o'` | AI model to use | - |
| `temperature` | number | `1.0` | Response creativity (0-2) | - |
| `timeoutMs` | number | `30000` | Request timeout in milliseconds | - |
| `memoryToolEnabled` | boolean | `true` | Enable automatic memory tool | - |
| `memoryToolExplicitOnly` | boolean | `true` | Only use memory when explicitly requested | - |
| `memoryToolMaxResults` | number | `5` | Maximum memories per search | - |

If an API key is not provided, it will be requested through a prompt.

```javascript
const mind = new WarpMind({
    baseURL: 'https://warp.cs.au.dk/mind/',  // API endpoint
    apiKey: 'your-auth-key',                 // Authentication
    model: 'gpt-4o',                     // Model selection
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

**Options:**
- `model` (string): Override the default model (e.g., 'gpt-4o', 'gpt-3.5-turbo')
- `temperature` (number): Control randomness (0-2, default: instance temperature)
- `timeoutMs` (number): Request timeout in milliseconds
- `returnMetadata` (boolean): Return object with response and metadata instead of just string
- `onToolCall` (function): Callback when a tool is called - receives `{callId, name, parameters, timestamp}`
- `onToolResult` (function): Callback when tool completes - receives `{name, result, duration}`
- `onToolError` (function): Callback when tool fails - receives `{name, error, duration}`

```javascript
// Using options
const result = await mind.chat("Analyze this data", {
    temperature: 0.2,
    returnMetadata: true,
    onToolCall: (call) => console.log(`Tool called: ${call.name}`)
});

console.log('Response:', result.response);
console.log('Metadata:', result.metadata);
```

### `streamChat(message, onChunk, options)` → void

Real-time response streaming:

```javascript
let fullResponse = '';
await mind.streamChat("Write a short story", (chunk) => {
    fullResponse += chunk.content;
    document.getElementById('output').textContent = fullResponse;
});
```

**Options:** Same as `chat()` method above, including:
- `model`, `temperature`, `timeoutMs`
- Tool callbacks: `onToolCall`, `onToolResult`, `onToolError`
- `returnMetadata`: Returns metadata after streaming completes

```javascript
// Streaming with options
await mind.streamChat("Generate a detailed report", 
    (chunk) => {
        console.log('Chunk:', chunk.content);
        updateUI(chunk.content);
    },
    {
        temperature: 0.7,
        onToolCall: (call) => console.log(`Streaming tool call: ${call.name}`)
    }
);
```

### `complete(prompt, options)` → string

Text completion:

```javascript
const response = await mind.complete("The three laws of robotics are");
```

**Options:**
- `model` (string): Override the default model
- `temperature` (number): Control randomness (0-2, default: instance temperature)
- `timeoutMs` (number): Request timeout in milliseconds

```javascript
// Completion with options
const story = await mind.complete("Once upon a time in a distant galaxy", {
    temperature: 0.8
});
```

### `embed(text, options)` → number[]

Generate embeddings for text using semantic vector models:

```javascript
// Basic embedding generation
const embedding = await mind.embed("Machine learning is fascinating");

// With custom model
const embedding = await mind.embed("Text to embed", { 
    model: 'text-embedding-3-large' 
});

// With timeout
const embedding = await mind.embed("Text", { 
    timeoutMs: 10000 
});
```

Options:
- `model`: Embedding model to use (default: 'text-embedding-3-small')
- `timeoutMs`: Request timeout in milliseconds

Returns a normalized vector array for semantic similarity calculations. Used internally by the memory and PDF systems.

## Responses API

WarpMind supports OpenAI's new **Responses API** (`/v1/responses`), which provides advanced features like stateful conversations, background execution, and better integration with reasoning models.

### Why Use Responses API?

- **Stateful Conversations**: Automatic context retention via `previous_response_id` chaining
- **Background Execution**: Submit long-running tasks and poll for completion
- **Better Reasoning Support**: Optimized for o-series models with reasoning tracking
- **Unified Interface**: Consistent API for both synchronous and asynchronous operations
- **Response Management**: Retrieve, cancel, and delete responses by ID

### Quick Start with Responses API

```javascript
const mind = new WarpMind({
  baseURL: 'https://api.openai.com',
  apiKey: 'your-key',
  model: 'gpt-4o-mini'
});

// Basic respond (similar to chat())
const response = await mind.respond('Explain quantum computing');
console.log(response.text);
console.log(response.id);    // Response ID for later retrieval
console.log(response.usage);  // Token usage

// Streaming respond
await mind.streamRespond('Write a story', (event) => {
  if (event.delta) {
    process.stdout.write(event.delta);
  }
});

// Multi-turn conversation with automatic context
const conv = mind.createConversation({
  instructions: 'You are a helpful math tutor'
});

await conv.respond('What is 15 * 24?');
await conv.respond('Now add 100 to that');  // Remembers context
await conv.respond('Double it');            // Continues conversation

console.log(conv.getHistory());  // View full conversation
```

### Responses API Methods

#### `respond(input, options)` → {text, id, usage}

Send a message using the Responses API:

```javascript
// Simple string input
const response = await mind.respond('Hello, world!');

// With instructions (system prompt)
const response = await mind.respond('Analyze this data', {
  instructions: 'You are a data analyst',
  model: 'gpt-4o',
  temperature: 0.7
});

// Conversation chaining
const first = await mind.respond('Remember the number 42');
const second = await mind.respond('What number did I tell you?', {
  previous_response_id: first.id
});

// With metadata
const response = await mind.respond('Hello', {
  metadata: {
    user_id: '123',
    session_id: 'abc'
  }
});
```

**Input Formats:**
- String: `"Hello"`
- Chat Completions format: `[{role: 'user', content: 'Hello'}]`
- Responses API format: `[{type: 'message', role: 'user', content: [...]}]`

**Options:**
- `instructions` (string): System instructions
- `model` (string): Model to use
- `previous_response_id` (string): Previous response ID for chaining
- `store` (boolean): Store response for later retrieval (default: true)
- `metadata` (object): Custom metadata (max 16 key-value pairs)
- `temperature` (number): Response creativity (0-2)
- `max_output_tokens` (number): Maximum tokens in response
- `reasoning` (object): Reasoning settings for GPT-5 and o-series models
  - `effort`: Control thinking depth - `'minimal'`, `'low'`, `'medium'`, or `'high'`
    - `minimal`: Fast responses with minimal reasoning
    - `low`: Light reasoning for simple tasks
    - `medium`: Balanced reasoning (default)
    - `high`: Deep reasoning for complex problems

**Reasoning Example:**

```javascript
// Fast response with minimal thinking
const quick = await mind.respond('What is 2+2?', {
  reasoning: { effort: 'minimal' }
});

// Deep reasoning for complex problems
const deep = await mind.respond('Explain quantum entanglement', {
  reasoning: { effort: 'high' }
});

// Check reasoning token usage
console.log(deep.usage.output_tokens_details.reasoning_tokens);
```

#### `streamRespond(input, onChunk, options)` → {text, id, usage}

Stream responses in real-time:

```javascript
let fullText = '';

const response = await mind.streamRespond(
  'Count from 1 to 10',
  (event) => {
    if (event.delta) {
      fullText += event.delta;
      console.log(event.delta);
    }
  },
  {
    instructions: 'Count slowly',
    temperature: 0.5
  }
);

console.log('Final:', response.text);
console.log('ID:', response.id);
```

**onChunk Event:**
- `delta` (string): Text chunk
- `tool_calls` (array): Tool call deltas

**Options:** Same as `respond()`

#### `createConversation(options)` → Conversation

Create a stateful conversation instance:

```javascript
const conversation = mind.createConversation({
  instructions: 'You are a helpful assistant',
  model: 'gpt-4o'
});

// Send messages - context is automatically maintained
await conversation.respond('My name is Alice');
await conversation.respond('What is my name?');  // Knows it's Alice

// Streaming in conversations
await conversation.streamRespond('Tell me a joke', (event) => {
  if (event.delta) console.log(event.delta);
});

// Conversation management
console.log(conversation.getHistory());           // Get all messages
console.log(conversation.getMessageCount());      // Count messages
console.log(conversation.getLastMessage());       // Get last message

// Export/import for persistence (localStorage)
const exported = conversation.exportHistory();
localStorage.setItem('my-conversation', exported);

// Later...
const restored = mind.createConversation();
restored.importHistory(localStorage.getItem('my-conversation'));

// Clear conversation
await conversation.clear();
```

**Conversation Methods:**
- `respond(input, options)` - Send a message
- `streamRespond(input, onChunk, options)` - Stream a message
- `getHistory()` - Get conversation history
- `getMessageCount()` - Get number of messages
- `getLastMessage()` - Get last message
- `exportHistory()` - Export to JSON string
- `importHistory(data)` - Import from JSON string
- `clear()` - Clear conversation history

#### `getResponse(responseId, options)` → Response

Retrieve a response by ID:

```javascript
const response = await mind.getResponse('resp_abc123');

// With additional data
const response = await mind.getResponse('resp_abc123', {
  include: [
    'message.output_text.logprobs',
    'reasoning.encrypted_content'
  ]
});
```

#### `deleteResponse(responseId)` → Confirmation

Delete a stored response:

```javascript
await mind.deleteResponse('resp_abc123');
```

#### `cancelResponse(responseId)` → Confirmation

Cancel a response that's in progress:

```javascript
await mind.cancelResponse('resp_abc123');
```

#### `respondBackground(input, options)` → responseId

Submit a background task and return immediately:

```javascript
const taskId = await mind.respondBackground('Write a long essay', {
  instructions: 'Be detailed and thorough'
});

console.log('Task submitted:', taskId);

// Later, poll for completion
const result = await mind.pollUntilComplete(taskId);
console.log('Task complete:', result);
```

#### `pollUntilComplete(responseId, options)` → Response

Poll a background response until it's completed:

```javascript
const result = await mind.pollUntilComplete('resp_abc123', {
  maxWaitMs: 300000,      // Max 5 minutes
  initialDelayMs: 1000    // Start with 1 second
});

// Uses exponential backoff: 1s → 2s → 4s → 8s (max 10s)
```

### Responses API with Tools

Tools work seamlessly with the Responses API - just use `registerTool()` as before:

```javascript
// Register a tool (same as before)
mind.registerTool(
  'get_weather',
  async (args) => {
    return { temperature: 22, condition: 'sunny' };
  },
  {
    description: 'Get current weather',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' }
      },
      required: ['location']
    }
  }
);

// Tool is automatically available in Responses API
const response = await mind.respond('What is the weather in Paris?');
// Tool is executed automatically, just like with chat()
```

### Backward Compatibility

**All existing WarpMind methods work unchanged:**

```javascript
// Old API (Chat Completions) - still works perfectly
await mind.chat('Hello');
await mind.streamChat(messages, onChunk);
mind.registerTool(...);  // Works with both APIs

// New API (Responses) - added alongside
await mind.respond('Hello');
await mind.streamRespond(input, onChunk);
const conv = mind.createConversation();

// Tools, memory, PDF, vision, audio - all compatible with both APIs
```

### Migration Guide

**From `chat()` to `respond()`:**

```javascript
// Before (Chat Completions)
const response = await mind.chat([
  { role: 'system', content: 'You are helpful' },
  { role: 'user', content: 'Hello' }
]);

// After (Responses API - simpler)
const response = await mind.respond('Hello', {
  instructions: 'You are helpful'
});
console.log(response.text);  // Note: returns object, not string
```

**From `streamChat()` to `streamRespond()`:**

```javascript
// Before
await mind.streamChat(messages, (chunk) => {
  console.log(chunk.content);  // Note: chunk.content
});

// After
await mind.streamRespond(input, (event) => {
  console.log(event.delta);  // Note: event.delta
});
```

**Conversation Management:**

```javascript
// Before - manual history tracking
let history = [];
history.push({ role: 'user', content: 'Hello' });
const resp1 = await mind.chat(history);
history.push({ role: 'assistant', content: resp1 });
history.push({ role: 'user', content: 'How are you?' });
const resp2 = await mind.chat(history);

// After - automatic with Conversation
const conv = mind.createConversation();
await conv.respond('Hello');
await conv.respond('How are you?');
// Context is maintained automatically!
```

### Example: Complete Responses API Demo

See `examples/responses-demo.html` for a full interactive demo showcasing:
- Basic respond() usage
- Streaming responses
- Conversation management with export/import
- Tool calling integration
- Response management (get, cancel, delete)
- Background tasks with polling

## Multi-Modal Processing

### Image Analysis

Process images with AI vision models:

```javascript
// From file input
const imageFile = document.getElementById('imageInput').files[0];
const description = await mind.analyzeImage(imageFile, "Describe this image");

// From HTML img element (new!)
const imgElement = document.querySelector('#myImage');
const analysis = await mind.analyzeImage(imgElement, "What do you see?");

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

**Supported image inputs**: File objects, Blob objects, URLs (direct image links), and HTML img elements.

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
// Create a voice chat assistant
const voiceChat = mind.createVoiceChat(
    "You are a helpful assistant. Keep responses brief."
);

// Voice interaction - simple pattern
document.getElementById('startBtn').onclick = async () => {
    await voiceChat.startRecording();
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    console.log('🎤 Recording started... Speak now!');
};

document.getElementById('stopBtn').onclick = async () => {
    const result = await voiceChat.stopRecordingAndRespond();
    
    console.log('You said:', result.userMessage);
    console.log('AI replied:', result.aiResponse);
    
    // Play the AI's audio response
    if (result.audioBlob) {
        await mind.playAudio(result.audioBlob);
    }
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
};
```

**HTML for demo:**
```html
<button id="startBtn">🎤 Start Recording</button>
<button id="stopBtn" disabled>⏹️ Stop & Get Response</button>
```

**Returns:** Object with `userMessage`, `aiResponse`, `audioBlob`, and `conversation` properties.

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
    pageRange: [1, 50],                      // Process specific pages (optional)
    onProgress: (progress) => console.log(`${Math.round(progress * 100)}%`)
});

// From URL (full URL)
const pdfId = await mind.readPdf('https://example.com/document.pdf');

// From relative URL (relative to your web page)
const pdfId = await mind.readPdf('documents/research-paper.pdf');
const pdfId = await mind.readPdf('./instrumental_interaction.pdf');
const pdfId = await mind.readPdf('/static/pdfs/document.pdf');

// Process specific page range to stay within limits
const pdfId = await mind.readPdf('large-document.pdf', {
    pageRange: { start: 10, end: 60 }        // Object format also supported
});
```

**Page Limits**: PDFs are limited to a maximum of 100 pages to prevent excessive API usage. For larger documents, specify a `pageRange` to process only the needed sections.

The library supports File objects from input elements and HTTP URLs (both absolute and relative to your web server).

### PDF Management

```javascript
// Check status
const isLoaded = await mind.isPdfRead('research-paper');

// List all PDFs with page information
const pdfList = await mind.listReadPdfs();
console.log(pdfList);
// [
//   {
//     id: 'research-paper',
//     title: 'research-paper', 
//     numPages: 150,
//     pagesProcessed: 50,
//     pageRange: { start: 1, end: 50 },
//     totalChunks: 25,
//     processedAt: '2025-08-22T10:30:00.000Z'
//   }
// ]

// Storage information
const storageInfo = await mind.getPdfStorageInfo();

// Remove from storage
await mind.forgetPdf('research-paper');
```

### PDF Export/Import

#### `exportPdf(pdfId, options)` → Promise\<ExportResult\>

Export a processed PDF with all embeddings and metadata as a downloadable ZIP file:

```javascript
// Export a processed PDF
const exportResult = await mind.exportPdf('research-paper');

// Create download link automatically
const url = URL.createObjectURL(exportResult.blob);
const a = document.createElement('a');
a.href = url;
a.download = exportResult.fileName; // e.g., "research_paper_warpmind_export.zip"
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);

console.log(`Exported: ${exportResult.fileName}`);
console.log(`Size: ${(exportResult.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Contains: ${exportResult.chunks} chunks`);
```

**Export Result Object:**
```javascript
{
    blob: Blob,              // ZIP file as blob
    fileName: string,        // Suggested filename
    size: number,           // File size in bytes
    pdfId: string,          // Original PDF ID
    title: string,          // PDF title
    chunks: number,         // Number of text chunks
    exportedAt: string      // ISO timestamp
}
```

#### `importPdf(zipFile, options)` → Promise\<ImportResult\>

Import a previously exported PDF ZIP file to instantly restore all processing data:

```javascript
// From file input
const fileInput = document.getElementById('importFile');
const zipFile = fileInput.files[0];

const importResult = await mind.importPdf(zipFile, {
    overwrite: false,           // Whether to overwrite existing PDFs
    onProgress: (progress, message) => {
        console.log(`${progress}%: ${message}`);
    }
});

console.log(`Imported: ${importResult.title}`);
console.log(`${importResult.chunks} chunks, ${importResult.pages} pages`);

// PDF is immediately available for use
const answer = await mind.chat("What is this document about?");
```

**Import Options:**
- `overwrite` (boolean): Replace existing PDF with same ID (default: false)
- `onProgress` (function): Progress callback with percentage and status message

**Import Result Object:**
```javascript
{
    pdfId: string,              // PDF identifier
    title: string,              // Document title
    chunks: number,             // Number of text chunks
    pages: number,              // Number of pages
    importedAt: string,         // Import timestamp
    originalExport: {           // Original export metadata
        exportedAt: string,
        version: string
    }
}
```

#### ZIP File Structure

Exported ZIP files contain:
- `manifest.json` - Export metadata and version info
- `metadata.json` - PDF metadata (title, pages, processing info)
- `embeddings.json` - Text chunks with embeddings
- `content.json` - Full text and page contents

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
const answer = await mind.chat("What is the main conclusion in the PDF?");
const summary = await mind.chat("Summarize the methodology in the PDF");
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

## Custom Tool Integration

Connect AI to custom functions. The AI automatically decides when to use your tools.

### Basic Tool Registration

Register custom functions that the AI can call:

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

### Tool Management

Control registered tools dynamically:

```javascript
// Check if a tool is registered
const isRegistered = mind.isToolRegistered('getWeather');

// Get all registered tool names
const toolNames = mind.getRegisteredTools();
console.log(toolNames); // ['getWeather', 'saveNote', ...]

// Unregister a specific tool
const wasRemoved = mind.unregisterTool('getWeather');

// Clear all registered tools
mind.clearAllTools();
```

### Tool Call Monitoring

Monitor and debug tool execution:

```javascript
const response = await mind.chat("What's the weather in Tokyo?", {
    onToolCall: (call) => {
        console.log(`🔧 Tool called: ${call.name}`);
        console.log(`Parameters:`, call.parameters);
    },
    onToolResult: (result) => {
        console.log(`✅ Tool completed: ${result.name} (${result.duration}ms)`);
        console.log(`Result:`, result.result);
    },
    onToolError: (error) => {
        console.log(`❌ Tool failed: ${error.name} - ${error.error}`);
    }
});

// Get detailed metadata about tool calls
const result = await mind.chat("Analyze this data", {
    returnMetadata: true
});
console.log('Response:', result.response);
console.log('Tools called:', result.metadata.toolCalls.length);
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

**Method Compatibility**: Tools work with `chat()`, `analyzeImage()`, `streamChat()`, and `process()`. Not supported in `complete()` or audio methods.


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

// Text completion
await mind.complete("The three laws of robotics are")

// Generate embeddings
const embedding = await mind.embed("Text to embed")

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
mind.unregisterTool("myTool")                            // Remove specific tool
mind.isToolRegistered("myTool")                          // Check if tool exists
mind.getRegisteredTools()                                // List all tool names
mind.clearAllTools()                                     // Remove all tools
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
    model: 'gpt-4o',                       // AI model
    temperature: 1.0,                          // Creativity level
    timeoutMs: 30000                           // Default timeout
});
```

## Acknowledgement

This proxy was developed with the assistance of AI (GitHub Copilot, using GPT-4.1 and Claude Sonnet 4).

## License

This project is licensed under the MIT License. See the LICENSE file for details.
