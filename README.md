# WarpMind

A JavaScript library for AI integration designed for browser environments. Works directly in browsers with minimal setup - include one file and start building AI applications with https://warp.cs.au.dk/mind.

## What Can You Build?

- **Chatbots** - Create conversational AI assistants
- **Image Analysis** - Build apps that can "see" and describe photos
- **Voice Interfaces** - Add speech recognition and text-to-speech
- **Smart Tools** - Let AI use custom functions you create
- **Data Processing** - Extract and structure information from text
- **Real-time Apps** - Stream AI responses as they're generated
- **Document Analysis** - Read and analyze PDFs with semantic search
- **Knowledge Base** - Build searchable document collections with RAG

## Key Features

- **No Installation** - Works directly in browsers, no build tools required
- **Lightweight** - 368 KiB with PDF support, modular design
- **Multi-modal** - Text, images, voice, PDFs, and custom tool support
- **PDF Reading** - Extract text and images from PDFs with semantic search
- **Tool Calling** - Let AI use functions you write
- **Streaming** - Real-time response streaming
- **Auto-retry** - Built-in error handling and automatic retries with exponential backoff
- **Usage Tracking** - Monitor token costs and usage
- **Performance** - Optimized for fast loading and responsive interfaces

## Quick Start

### Step 1: Get the Library

Download `warpMind.js` from the `dist/` folder and include it in your HTML:

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

    <!-- Include WarpMind -->
    <script src="warpMind.js"></script>
    
    <script>
        // Initialize with warp.cs.au.dk/mind
        const mind = new WarpMind({
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

```javascript
const mind = new WarpMind({
    baseURL: 'https://warp.cs.au.dk/mind/',  // Warp CS API endpoint
    apiKey: 'your-auth-key',                   // Your API key (see API Key Management below)
    model: 'gpt-3.5-turbo',                    // AI model to use
    temperature: 0.7,                          // Creativity (0 = precise, 2 = creative)
    timeoutMs: 30000                           // Timeout in milliseconds (default: 30 seconds)
});
```

You can also change settings after initialization:

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
The main method for communicating with AI. Supports both single messages and conversation history.

```javascript
// Simple question
const response = await mind.chat("Explain photosynthesis");

// Conversation with history
const conversation = [
    { role: 'system', content: 'You are a helpful programming tutor' },
    { role: 'user', content: 'What is a for loop?' },
    { role: 'assistant', content: 'A for loop is...' },
    { role: 'user', content: 'Can you show me an example?' }
];
const response = await mind.chat(conversation);

// Message roles:
// 'system' = Instructions for how AI should behave
// 'user' = What the human says
// 'assistant' = What the AI said before
```

### `streamChat(message, onChunk, options)`
Stream responses in real-time as AI generates them.

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

AI image analysis and description:

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

// Other applications
const meme = await mind.analyzeImage(imageFile, "Create a funny caption for this image");
const code = await mind.analyzeImage(codeScreenshot, "Explain what this code does");

// With usage tracking
const result = await mind.analyzeImage(imageFile, "Analyze this graph", { 
    detail: 'high', 
    includeUsage: true 
});
console.log('Analysis:', result.text);
console.log('Tokens used:', result.usage); // High detail images use more tokens
```

**Important**: The `detail: 'high'` option provides more detailed analysis but uses approximately 2× the tokens (costs more).

### Text-to-Speech with `textToSpeech(text, options)`

Convert text to speech audio:

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

// Example: AI narrator
const story = await mind.chat("Tell a 30-second adventure story");
const narration = await mind.textToSpeech(story, { voice: 'fable', speed: 0.9 });
await mind.playAudio(narration);
```

### Speech-to-Text with `speechToText(audioFile, options)`

Convert audio to text:

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

Create voice conversations with AI:

```javascript
// Create a voice assistant
const voiceAssistant = mind.createVoiceChat(
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
    await voiceAssistant.startRecording();
    // User speaks...
    const result = await voiceAssistant.stopRecordingAndRespond();
    
    console.log('You said:', result.userMessage);
    console.log('AI replied:', result.aiResponse);
    // AI response is automatically spoken if autoSpeak: true
};

// Stop recording and any ongoing processing
document.getElementById('stopButton').onclick = () => {
    voiceAssistant.abort();
};
```

## PDF Reading & RAG (Retrieval-Augmented Generation)

WarpMind can read PDF documents, extract both text and images, and provide semantic search capabilities. This enables powerful document analysis and question-answering based on PDF content.

### Loading PDFs with `readPdf(source, options)`

```javascript
// Load from file input
const fileInput = document.getElementById('pdfFile');
const pdfFile = fileInput.files[0];

const pdfId = await mind.readPdf(pdfFile, {
    id: 'research-paper',                     // Optional custom ID
    chunkTokens: 400,                        // Tokens per chunk (default: 400)
    embedModel: 'text-embedding-3-small',    // Embedding model
    processImages: true,                     // Extract and analyze images (default: true)
    imageDetail: 'high',                     // 'low' or 'high' for image analysis
    imagePrompt: 'Describe this chart or diagram for academic use',
    onProgress: (progress) => {
        console.log(`Processing: ${Math.round(progress * 100)}%`);
    }
});

// Load from URL
const pdfId = await mind.readPdf('https://example.com/document.pdf');

// Load example PDF included with WarpMind
const exampleId = await mind.readPdf('examples/instrumental_interaction.pdf', {
    processImages: true,
    imageDetail: 'high'  // Good for analyzing academic diagrams
});
```

### PDF Management

```javascript
// Check if PDFs are loaded
const isLoaded = await mind.isPdfRead('research-paper');
const loadedStatus = await mind.isPdfRead(['paper1', 'paper2', 'paper3']);

// List all loaded PDFs
const pdfList = await mind.listReadPdfs();
console.log('Loaded PDFs:', pdfList);
// Returns: [{ id: 'research-paper', title: 'Research Paper', numPages: 25, totalChunks: 67, processedAt: '2024-01-15T10:30:00Z' }]

// Get storage information
const storageInfo = await mind.getPdfStorageInfo();
console.log('Storage used:', storageInfo.totalSize, storageInfo.unit);
console.log('PDF breakdown:', storageInfo.pdfs);
// Returns: { totalSize: 15.2, unit: 'MB', pdfs: [{id: 'pdf1', size: 5.1, chunks: 45}, ...] }

// Remove a PDF from storage
await mind.forgetPdf('research-paper');
```

### Loading PDFs into Memory with `recall(pdfId)`

The `recall()` method loads a previously processed PDF from storage back into memory, making it available for chat and tool calling without reprocessing:

```javascript
// Load a previously processed PDF into memory
await mind.recall('research-paper');

// After recall, the PDF is available for chat
const answer = await mind.chat("What were the key findings?");

// Recall multiple PDFs if needed
await mind.recall('paper1');
await mind.recall('paper2');
```

**Benefits of `recall()`:**
- **Fast Loading**: Instantly loads PDF from cache without reprocessing
- **Tool Registration**: Automatically registers search tools for AI to use
- **Memory Efficient**: Only loads PDF data when needed
- **Seamless Integration**: Works transparently with chat and other methods

**When to use `recall()`:**
- Loading PDFs that were processed in a previous session
- Switching between different PDFs in your application
- Building PDF library management interfaces
- Implementing "quick load" functionality

```javascript
// Example: PDF library management
const availablePdfs = await mind.listReadPdfs();
console.log('Available PDFs:', availablePdfs);

// Let user select a PDF to recall
const selectedPdfId = 'user-selected-pdf';
await mind.recall(selectedPdfId);

// PDF is now ready for use
const response = await mind.chat("Summarize this document");
```

### Chat with PDF Content

Once a PDF is loaded, WarpMind automatically registers retrieval tools that enable the AI to search and reference the document content:

```javascript
// After loading a PDF, the AI can answer questions about it
const answer = await mind.chat("What is the main conclusion of this research?");
const summary = await mind.chat("Summarize the methodology section");
const imageAnalysis = await mind.chat("What does the chart in figure 3 show?");

// AI automatically searches relevant content and provides contextualized answers
```

### Multi-Modal PDF Processing

WarpMind processes both text and images from PDFs:

- **Text Extraction**: Extracts all text content using PDF.js
- **Image Analysis**: Captures charts, diagrams, and figures
- **Vision AI**: Analyzes images using vision models to generate descriptions
- **Semantic Chunking**: Combines text and image descriptions into searchable chunks
- **Persistent Storage**: Caches processed content in IndexedDB for fast reload

### Advanced PDF Features

```javascript
// Fine-tuned processing for academic papers
const academicPdf = await mind.readPdf(file, {
    chunkTokens: 600,                        // Larger chunks for academic content
    processImages: true,
    imageDetail: 'high',                     // Better for complex diagrams
    imagePrompt: 'Describe this scientific diagram, chart, or figure in detail, including any data trends, labels, and key findings shown.',
    embedModel: 'text-embedding-3-large'    // More accurate embeddings
});

// Optimized for speed and cost
const quickPdf = await mind.readPdf(file, {
    chunkTokens: 300,                        // Smaller chunks
    processImages: false,                    // Skip image processing
    embedModel: 'text-embedding-3-small'    // Faster, cheaper embeddings
});
```

### PDF Use Cases

- **Research Papers**: Analyze academic papers, understand methodologies, extract key findings
- **Technical Documentation**: Search through manuals, understand procedures, find specific information
- **Legal Documents**: Review contracts, find clauses, understand terms
- **Educational Materials**: Study textbooks, answer questions about content, create summaries
- **Reports**: Extract insights from business reports, financial documents, analysis papers

### PDF Example Demo

See `examples/pdf-reader-demo.html` for a complete demonstration of PDF reading capabilities, including:
- File upload and URL loading
- Real-time processing progress
- Chat interface with loaded PDFs
- PDF library management with recall functionality
- **Structured data extraction using `process("prompt", "pdf", schema)`**
- Storage management and usage tracking
- Multi-modal content analysis

The demo showcases the streamlined PDF processing approach using `mind.process("Extract info", "pdf", schema)` for cleaner, more efficient data extraction from PDF documents.

---

## 🔧 Tool Calling System

Let AI use custom functions you create. Perfect for connecting AI to databases, APIs, or custom logic.

### Basic Tool Registration

```javascript
// Register a weather lookup tool
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

// Now chat normally - AI will use tools when appropriate
const response = await mind.chat("What's the weather in Tokyo and what's 15 * 23?");
// AI automatically calls getWeather('Tokyo') and calculate('15 * 23')
// Then provides a natural language response with the results
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

The AI will not call tools unnecessarily - it only uses them when they're needed to answer the question.

### Tool Calling Compatibility

**✅ Methods that support tool calling:**
- `chat()` - Full tool calling support
- `ask()` - Supports tools (wrapper around chat)
- `analyzeImage()` - Can use tools alongside image analysis
- `process()` - Can use tools for data processing

**❌ Methods that don't support tool calling:**
- `streamChat()` - No tool support (streaming conflicts with tool execution)
- `complete()` - Uses different API endpoint that doesn't support tools
- Audio methods (`textToSpeech`, `speechToText`, `createVoiceChat`) - Voice interfaces don't support tools

### Structured Data Processing

### `process(prompt, data, schema, options)`

Extract and organize information from unstructured data:

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

#### PDF Processing with `process()`

For PDF documents, you can use `"pdf"` as the data parameter to extract structured information directly from the currently loaded PDF:

```javascript
// Load a PDF first
await mind.readPdf('research-paper.pdf');
// or recall a previously loaded PDF
await mind.recall('research-paper-id');

// Extract structured data from the PDF
const paperAnalysis = await mind.process(
    "Extract key information from this research paper",
    "pdf",  // Special keyword for PDF processing
    {
        title: "Paper title",
        authors: "Array of author names",
        methodology: "Research methodology used",
        keyFindings: "Array of main findings",
        conclusions: "Main conclusions",
        limitations: "Study limitations mentioned"
    }
);

// Extract specific information
const methodology = await mind.process(
    "Focus on the methodology section",
    "pdf",
    {
        method: "What method was applied",
        sampleSize: "Number of participants or data points",
        procedure: "Step-by-step procedure",
        tools: "Tools or software used"
    }
);

// Financial document processing
const financial = await mind.process(
    "Extract financial metrics",
    "pdf",
    {
        revenue: "Total revenue figures",
        expenses: "Major expense categories",
        profit: "Net profit or loss",
        period: "Time period covered"
    }
);
```

**Benefits of PDF processing with `process()`:**
- **Automatic Content Retrieval**: No need to manually get PDF text
- **Smart Content Selection**: AI automatically finds relevant sections
- **Context-Aware**: Understands document structure and content
- **Efficient**: Optimized for PDF content extraction

**Traditional vs. PDF Processing:**
```javascript
// Traditional approach (still works)
const pdfText = await mind.chat("Get full text from PDF");
const result = await mind.process("Extract info", pdfText, schema);

// New streamlined approach
const result = await mind.process("Extract info", "pdf", schema);
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

WarpMind includes automatic retry logic and helpful error messages:

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
        console.log('Rate limited - WarpMind will automatically retry');
    } else {
        console.log('Error:', error.message);
    }
}
```

### Automatic Retries

WarpMind automatically retries failed requests with exponential backoff:
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

## API Key Management

For browser applications, WarpMind can automatically handle API key prompting and storage:

```javascript
// Create without API key - will prompt user automatically
const mind = new WarpMind({
    baseURL: 'https://warp.cs.au.dk/mind/',
    model: 'gpt-3.5-turbo'
});

// First time: User will be prompted to enter API key
// Future visits: API key is automatically loaded from browser storage
const response = await mind.chat("Hello, AI!");
```

When you create a WarpMind instance without an API key in a browser environment:
1. **First time**: User gets a prompt to enter their API key
2. **Automatic save**: The API key is securely stored in the browser's localStorage
3. **Future visits**: The saved API key is automatically loaded

### API Key Helper Methods

```javascript
// Manually set and save API key
WarpMind.setApiKey('your-new-api-key');

// Check if an API key is already saved
const saved = WarpMind.getSavedApiKey();
console.log('Saved API key:', saved ? 'Yes' : 'No');

// Clear saved API key (user will be prompted again next time)
WarpMind.clearSavedApiKey();

// Force prompt for new API key
const newKey = await WarpMind.promptForApiKey();
```

This feature is particularly useful for students and quick prototypes where you want to minimize setup friction.

## Development & Building

### For Users

Download and use the library:
1. Download `warpMind.js` from the `dist/` folder
2. Include it in your HTML with `<script src="warpMind.js"></script>`
3. Start coding

### For Advanced Users & Contributors

If you want to modify the library or contribute:

```bash
# Clone or download the repository
git clone <repository-url>
cd warpMind

# Install development dependencies
npm install

# Build the library (creates dist/warpMind.js)
npm run build

# Run tests to make sure everything works
npm test
```

### Project Structure

```
warpMind/
├── src/                    # Source code (modular)
│   ├── warpMind.js        # Main library (284 lines)
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
│   └── warpMind.js        # Built library (single file, 368 KiB)
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

This lets advanced users work on the modular source code while keeping it simple for users who just want to use the library.

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

// PDF processing (shorthand)
const pdfData = await mind.process("Extract info", "pdf", schema)

// PDF management
await mind.readPdf(file)          // Load PDF
await mind.recall("pdf-id")       // Recall from storage
await mind.listReadPdfs()         // List all PDFs
await mind.forgetPdf("pdf-id")    // Remove from storage

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
const mind = new WarpMind({
    baseURL: 'https://warp.cs.au.dk/mind/v1',  // Warp CS API endpoint
    apiKey: 'your-key',                        // Your API key
    model: 'gpt-3.5-turbo',                    // AI model
    temperature: 0.7,                          // Creativity level
    timeoutMs: 30000                           // Default timeout
});
```

---
