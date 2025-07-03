# Warpmind

A JavaScript library for OpenAI API integration, designed for educational use with school proxy servers. Works directly in browsers with multi-modal support for text, images, and voice.

## Features

- **Simple API** - Easy-to-use methods for common AI tasks
- **Web-friendly** - Works directly in browsers with no build step required
- **Proxy Support** - Designed for school proxy servers with custom authentication
- **Multi-modal** - Text, image analysis, text-to-speech, and speech-to-text
- **Voice Chat** - Interactive voice conversations
- **Streaming Support** - Real-time response streaming
- **Student-focused** - Designed with educational use cases in mind

## Quick Start

### Installation

Download the built library from the `dist/` folder and include it in your HTML:

```html
<script src="warpmind.js"></script>
```

### Basic Usage

```javascript
// Initialize with school proxy server
const ai = new Warpmind({
    baseURL: 'http://localhost:8080/v1',  // Your school's proxy server
    apiKey: 'your-proxy-auth-key'         // Proxy authentication key
});

// Ask a question
const response = await ai.chat("What is the capital of France?");
console.log(response);
```

## Configuration

### Constructor Options

```javascript
const ai = new Warpmind({
    baseURL: 'http://localhost:8080/v1',  // Proxy server URL (auto-adds /v1)
    apiKey: 'your-auth-key',              // Proxy authentication key
    model: 'gpt-3.5-turbo',               // Default model
    maxTokens: 150,                       // Default max tokens
    temperature: 0.7                      // Default temperature
});
```

### Setting Configuration

```javascript
ai.setApiKey('your-auth-key');
ai.setBaseURL('http://localhost:8080/v1');
ai.setModel('gpt-4');
```

## Core Methods

### Basic Text Operations

#### `chat(message, options)`
Send a message and get a response. Accepts either a string or an array of message objects.

```javascript
// Simple string message
const response = await ai.chat("Explain quantum physics");

// Array of message objects (conventional format)
const response = await ai.chat([
    { role: 'system', content: 'You are a helpful tutor' },
    { role: 'user', content: 'Explain quantum physics' },
    { role: 'assistant', content: 'Quantum physics is...' },
    { role: 'user', content: 'Can you give an example?' }
]);

// Message roles:
// - 'system': Instructions for the AI's behavior
// - 'user': Messages from the human user
// - 'assistant': Previous AI responses (for conversation history)
```

#### `complete(prompt, options)`
Generate a completion for text.

```javascript
const response = await ai.complete("The weather today is", { maxTokens: 50 });
```

#### `streamChat(message, onChunk, options)`
Stream responses in real-time.

```javascript
await ai.streamChat("Tell me a story", (chunk) => {
    console.log(chunk);
});
```

### Multi-Modal Operations

#### `analyzeImage(image, prompt, options)`
Analyze images with AI vision.

```javascript
// With image file
const analysis = await ai.analyzeImage(imageFile, "What's in this image?");

// With image URL
const analysis = await ai.analyzeImage(
    'https://example.com/image.jpg',
    'Describe this image'
);
```

#### `textToSpeech(text, options)`
Convert text to speech.

```javascript
const audioBlob = await ai.textToSpeech("Hello world", {
    voice: 'alloy',
    speed: 1.0
});

// Play the audio
await ai.playAudio(audioBlob);
```

#### `speechToText(audioFile, options)`
Transcribe audio to text.

```javascript
const transcription = await ai.speechToText(audioFile, {
    language: 'en'
});
```

#### `createVoiceChat(systemPrompt, options)`
Create interactive voice conversations.

```javascript
const voiceChat = ai.createVoiceChat("You are a helpful tutor");
await voiceChat.startRecording();
const result = await voiceChat.stopRecordingAndRespond();
console.log('You said:', result.userMessage);
console.log('AI replied:', result.aiResponse);
```

### Structured Data Processing

#### `process(prompt, data, schema, options)`
Process data and get structured JSON output with automatic retries.

```javascript
// Basic sentiment analysis
const result = await ai.process(
    "Analyze this review", 
    "This product is amazing! I love it.", 
    {
        sentiment: "positive, negative, or neutral",
        confidence: "confidence score from 0 to 1",
        keywords: "array of important words"
    }
);
// Returns: { sentiment: "positive", confidence: 0.9, keywords: ["amazing", "love"] }

// Data extraction from text
const contacts = await ai.process(
    "Extract contact information",
    "Call John Smith at 555-123-4567 or email john@company.com",
    {
        name: "person's name",
        phone: "phone number",
        email: "email address"
    }
);
// Returns: { name: "John Smith", phone: "555-123-4567", email: "john@company.com" }

// Complex data analysis
const analysis = await ai.process(
    "Analyze sales performance",
    { q1: 15000, q2: 18000, q3: 16000, q4: 22000 },
    {
        total: "total sales",
        trend: "growth trend description",
        bestQuarter: "quarter with highest sales"
    },
    { retries: 3 } // Custom retry count
);
```

The `process` method automatically:
- Validates the response against your schema
- Retries up to 3 times on failures (configurable)
- Ensures all required fields are present
- Returns parsed JSON objects

## HTML Integration

See the examples in the `examples/` folder for complete working demonstrations:

- `basic-example.html` - Simple chat interface
- `complete-test-suite.html` - Comprehensive testing of all features
- `multi-modal-example.html` - Image, voice, and text interactions

## Development

### Building the Library

```bash
# Install dependencies
npm install

# Build for production
npm run build
```

### Project Structure

```
warpmind/
├── src/
│   └── warpmind.js      # Main library source
├── dist/
│   └── warpmind.js      # Built library
├── examples/            # Usage examples
├── docs/               # Documentation
├── tests/              # Node.js tests
├── package.json
├── webpack.config.js
└── README.md
```

## Error Handling

```javascript
try {
    const response = await ai.chat("Hello");
    console.log(response);
} catch (error) {
    if (error.message.includes('authentication')) {
        console.log('Check your API key or proxy configuration');
    } else if (error.message.includes('Network')) {
        console.log('Check your internet connection or proxy server');
    } else {
        console.log('Error:', error.message);
    }
}
```

## License

MIT License

## Acknowledgements

Development of this library was assisted by Claude Sonnet 4 through Copilot.

