# WarpMind Responses API Implementation Guide

> **Status**: ✅ Implementation-ready  
> **Last Updated**: January 2025  
> **Verification**: Checked against OpenAI docs + 3 external guides (DataCamp, Medium, AI SDK)

## Oversigt

OpenAI's Responses API er deres nyeste interface til model interaktion. Det er mere avanceret end Chat Completions API'et og supporterer stateful conversations, background execution, og bedre integration med reasoning models.

**VIGTIGT PRINCIP: Change by Addition, Not Modification**
- Eksisterende WarpMind API (chat, streamChat, etc.) forbliver 100% uændret
- Responses API tilføjes som parallel feature branch
- Alle eksisterende tests skal passe uden ændringer
- Backward compatibility er garanteret

**Automatisk Feature Kompatibilitet**:
- ✅ Tool calling (samme format som Chat Completions)
- ✅ Memory system (auto-registered via `registerTool()`)
- ✅ PDF loader (ingen dependencies på `chat()`)
- ✅ Vision module (genbruger `analyzeImage()` - supports img elements)
- ✅ Audio transcription (uafhængig af chat API)
- ✅ Data processing (pure utility functions)

## Table of Contents

1. [API Forskelle](#nøgle-forskelle-fra-chat-completions)
2. [Foreslået WarpMind API](#foreslået-warpmind-api-design)
3. [Implementation Strategi](#implementeringsstrategi)
4. [Eksisterende Features Kompatibilitet](#mapping-til-eksisterende-warpmind-features)
5. [Yderligere Features](#yderligere-features-fra-guides)
6. [Open Questions](#open-questions)
7. [References](#references)

## Nøgle Forskelle fra Chat Completions

### Request Structure
- **Endpoint**: `/v1/responses` i stedet for `/v1/chat/completions`
- **Input format**: `input` (string eller array) i stedet for `messages`
- **Instructions**: `instructions` parameter i stedet for system message i messages array
- **Conversation state**: `conversation` eller `previous_response_id` til multi-turn
- **Developer role**: Ny `developer` rolle med højere prioritet end `system`

### Response Structure
```javascript
{
  id: "resp_...",
  object: "response",
  status: "completed|in_progress|failed|cancelled|queued|incomplete",
  output: [
    {
      type: "message",
      id: "msg_...",
      role: "assistant",
      status: "completed",
      content: [
        { type: "output_text", text: "...", annotations: [] }
      ]
    }
  ],
  output_text: "aggregated text", // SDK convenience property
  conversation: {
    id: "conv_...",  // Server-side conversation ID
  },
  usage: { 
    input_tokens, 
    output_tokens, 
    total_tokens,
    input_tokens_details: { cached_tokens },
    output_tokens_details: { reasoning_tokens }
  },
  reasoning: {
    effort: "low|medium|high",
    summary: "what the model thought"
  },
  // ... mange flere felter
}
```

### Output Array Structure

Output er et array af items der kan være:
- `message` - Assistant messages med text/image content
- `function_call` - Tool/function calls
- `reasoning` - Reasoning steps (o-series models)

Eksempel:
```javascript
output: [
  { 
    type: "message", 
    role: "assistant",
    content: [
      { type: "output_text", text: "Let me search for that" }
    ]
  },
  {
    type: "function_call",
    name: "web_search",
    arguments: "{\"query\":\"...\"}"
  },
  {
    type: "message",
    role: "assistant", 
    content: [
      { type: "output_text", text: "Based on the search..." }
    ]
  }
]
```

### Nye Capabilities
1. **Stateful conversations**: Server-side conversation management
2. **Response retrieval**: GET `/v1/responses/{id}` til at hente tidligere responses
3. **Background execution**: `background: true` for long-running tasks
4. **Response cancellation**: POST `/v1/responses/{id}/cancel`
5. **Input item listing**: GET `/v1/responses/{id}/input_items`
6. **Token counting**: POST `/v1/responses/input_tokens`

## Foreslået WarpMind API Design

### 1. Basic Response Method

```javascript
// Simpel usage
const response = await mind.respond("What is 2+2?");

// Med options
const response = await mind.respond("Analyze this", {
  model: 'gpt-4o',
  temperature: 0.7,
  max_output_tokens: 1000,
  instructions: "You are a helpful assistant",
  includeUsage: true
});

// Return format (simplified from OpenAI response)
// OpenAI returns: { id, object, output: [...], output_text, usage, ... }
// WarpMind simplifies to:
{
  text: "4",              // Extracted from output_text
  id: "resp_...",         // Pass through
  usage: { ... }          // Always included (unlike Chat Completions)
}
```

### 2. Streaming Response

```javascript
await mind.streamRespond("Tell me a story", (chunk) => {
  console.log(chunk.content);
}, {
  model: 'gpt-4o',
  temperature: 0.8
});
```

### 3. Conversation Management

**Anbefalet approach: previous_response_id chaining (simplest)**

OpenAI's `conversation` parameter er til server-side tracking, men kræver ekstra setup. 
For WarpMind starter vi med `previous_response_id` chaining som er simplere.

```javascript
// Conversation object med automatic chaining
const conversation = mind.createConversation({
  instructions: "You are a coding assistant"
});

const resp1 = await conversation.respond("What is recursion?");
const resp2 = await conversation.respond("Show me an example");
const resp3 = await conversation.respond("Explain the base case");

// Conversation state håndteres automatisk via previous_response_id
await conversation.clear(); // Clear local history
const history = conversation.getHistory(); // Get all responses

// Manual chaining (hvis du ikke vil bruge Conversation class)
const resp1 = await mind.respond("What is recursion?");
const resp2 = await mind.respond("Show me an example", {
  previous_response_id: resp1.id
});
```

### 4. Background Execution

```javascript
// Start background task
const task = await mind.respondBackground("Process large dataset", {
  model: 'gpt-4o',
  max_output_tokens: 4000
});

console.log(task.id); // resp_...
console.log(task.status); // "queued" or "in_progress"

// Manual polling with exponential backoff (recommended pattern)
async function pollUntilComplete(responseId, maxWaitMs = 60000) {
  const startTime = Date.now();
  let delay = 1000; // Start with 1s
  
  while (Date.now() - startTime < maxWaitMs) {
    const result = await mind.getResponse(responseId);
    
    if (result.status === 'completed') {
      return result.text;
    } else if (result.status === 'failed' || result.status === 'cancelled') {
      throw new Error(`Response ${result.status}: ${result.error?.message}`);
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
    await sleep(delay);
    delay = Math.min(delay * 2, 10000);
  }
  
  throw new Error('Polling timeout');
}

const result = await pollUntilComplete(task.id);

// Or cancel
await mind.cancelResponse(task.id);
```

### 5. Response Retrieval

```javascript
// Get stored response
const stored = await mind.getResponse(responseId);

// Delete response (hvis store: true blev brugt)
await mind.deleteResponse(responseId);

// Get input items
const inputs = await mind.getResponseInputs(responseId, {
  limit: 20,
  order: 'desc'
});
```

### 6. Token Counting

```javascript
// Count tokens before sending
const count = await mind.countResponseTokens({
  input: "What is the meaning of life?",
  model: 'gpt-4o',
  instructions: "You are a philosopher"
});

console.log(count.input_tokens); // 11
```

## Mapping til Eksisterende WarpMind Features

### Tool Calling - Fuld Kompatibilitet ✅

**WarpMind's eksisterende tool system virker automatisk med Responses API!**

Responses API bruger præcis samme tool format som Chat Completions:

```javascript
// Eksisterende tool registration - UÆNDRET
mind.registerTool({
  name: 'get_weather',
  description: 'Get weather for location',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' }
    },
    required: ['location']
  },
  handler: async ({ location }) => {
    return { temp: 72, condition: 'sunny' };
  }
});

// Tools virker automatisk med BÅDE chat() og respond()
await mind.chat("What's the weather in Paris?");     // ✅ Uses tool
await mind.respond("What's the weather in Paris?");  // ✅ Uses same tool!
```

**Implementation note**: response-client.js skal inkludere `mind._tools` i requests, samme som chat() gør, og genbruge `mind._executeTool()` for tool execution.

### Memory System - Virker Automatisk ✅

Memory tool er registreret via `registerTool()`, så den virker automatisk:

```javascript
// Memory tool er auto-registreret i memory module - UÆNDRET

// Virker med chat()
await mind.chat("What do you remember about my food preferences?");

// Virker OGSÅ med respond() - INGEN ændringer nødvendigt!
await mind.respond("What do you remember about my food preferences?");
// → Memory tool triggers automatisk - samme tool, samme handler!

// Memory metoder virker uændret
await mind.remember("I love Italian food", { tags: ['food'] });
const memories = await mind.recall("food preferences");
```

**Ingen ændringer nødvendige i memory.js** - det registrerer allerede et tool der virker med begge APIs.

### PDF System - Virker Uændret ✅

```javascript
// PDF metoder er uændrede
await mind.loadPdf(fileOrUrl);
const pdfs = mind.getLoadedPdfs();
const results = await mind.searchPdf("quantum", { topK: 5 });

// PDF data er tilgængelig i prompts med BÅDE chat() og respond()
await mind.chat("Based on the loaded PDFs, explain quantum entanglement");
await mind.respond("Based on the loaded PDFs, explain quantum entanglement");
```

### Custom Tools - Fuld Kompatibilitet ✅

```javascript
// Brugerdefinerede tools virker automatisk med begge APIs
mind.registerTool({
  name: 'search_database',
  description: 'Search internal database',
  parameters: { /* ... */ },
  handler: async (params) => { 
    return results;
  }
});

// Virker med begge
await mind.chat("Search the database");     // ✅
await mind.respond("Search the database");  // ✅
```

**Konklusion**: ALT virker automatisk fordi tool system er centraliseret i `this._tools` og bruger samme format.

### Image Analysis

WarpMind's `analyzeImage()` understøtter allerede flere input typer:

```javascript
// File/Blob
const file = document.querySelector('input[type=file]').files[0];
await mind.analyzeImage(file, "Describe this");

// URL
await mind.analyzeImage('https://example.com/image.jpg', "What's in this?");

// HTML img element (fetch + convert automatisk!)
const imgElement = document.querySelector('#myImage');
await mind.analyzeImage(imgElement, "Analyze this");

// Base64 data URL
await mind.analyzeImage('data:image/jpeg;base64,...', "Describe");
```

Med Responses API kan det også gøres direkte:

```javascript
// Via respond med array input
const response = await mind.respond([
  { type: 'input_text', text: 'Describe this' },
  { type: 'input_image', image_url: { url: 'https://...' } }
]);

// Eller behold analyzeImage som convenience wrapper der håndterer:
// - Automatic File/Blob → base64 conversion
// - HTML img element fetching
// - Detail level ('low' | 'high')
const desc = await mind.analyzeImage(imgElement, "Describe this", {
  detail: 'high'
});
```

**Implementation note**: `analyzeImage()` bør opdateres til at kunne bruge Responses API internt når det er implementeret, men bevare samme convenience interface.

### Memory Integration
```javascript
// Memory tool virker stadig - det er bare function calling
const response = await mind.respond("What do you remember about my preferences?");
// Memory tool triggers automatisk hvis configured
```

## Implementeringsstrategi

### Design Princip: Change by Addition, Not Modification

**Kerneprincip**: Eksisterende WarpMind API skal være 100% uændret. Responses API er en parallel feature branch, ikke en erstatning.

### Ingen Breaking Changes

```javascript
// Alt dette skal virke præcis som før - INGEN ændringer
const mind = new WarpMind({ baseURL: '...' });

await mind.chat("Hello");                    // ✅ Uændret
await mind.streamChat("Hi", onChunk);        // ✅ Uændret  
await mind.analyzeImage(img, "Describe");    // ✅ Uændret
await mind.textToSpeech("Hello");            // ✅ Uændret
await mind.remember("I like pizza");         // ✅ Uændret
await mind.recall("food preferences");       // ✅ Uændret
await mind.process("Extract", data, schema); // ✅ Uændret
mind.registerTool({ ... });                  // ✅ Uændret

// Nye features - kun tilgængelige hvis man aktivt vælger dem
await mind.respond("Hello");                 // ✨ Ny
await mind.streamRespond("Hi", onChunk);     // ✨ Ny
const conv = mind.createConversation();      // ✨ Ny
```

### Arkitektur: Parallel Tracks

```
src/
  warpmind.js                    [MINIMAL TOUCH - kun tilføj nye methods]
  
  core/
    base-client.js               [UDVIDELSE - tilføj GET/DELETE support]
    response-client.js           [NY FIL - Responses API logic]
  
  modules/                       [INGEN ÆNDRINGER]
    audio.js                     [Unchanged]
    vision.js                    [Unchanged]  
    memory.js                    [Unchanged]
    pdf-loader.js                [Unchanged]
    data-processing.js           [Unchanged]
    tool-call-tracker.js         [Unchanged]
  
  streaming/
    sse-parser.js                [INGEN ÆNDRING - genbruges]
    response-sse-parser.js       [NY FIL - hvis nødvendigt]
  
  conversations/                 [NY MAPPE]
    conversation.js              [NY FIL]
```

### Kirurgiske Indgreb

**1. base-client.js** - Minimale udvidelser

```javascript
// EXISTING: makeRequest(endpoint, data, options)
// Understøtter kun POST

// ADD: Minimal udvidelse til at supportere andre HTTP methods
async makeRequest(endpoint, data, options = {}) {
  // ADD: method parameter (default: 'POST' - bevarer eksisterende adfærd)
  const method = options.method || 'POST';
  
  // ADD: query params support (kun brugt hvis angivet)
  const url = options.queryParams 
    ? this._buildApiUrlWithQuery(endpoint, options.queryParams)
    : this._buildApiUrl(endpoint);
  
  // EXISTING: Alt andet logic er uændret
  // ...
  
  const fetchOptions = {
    method: method,  // CHANGED: var hardcoded 'POST'
    headers: {
      'Content-Type': 'application/json',
      'api-key': this.apiKey
    },
    signal: controller.signal
  };
  
  // ADD: Skip body for GET/DELETE
  if (data && method !== 'GET' && method !== 'DELETE') {
    fetchOptions.body = JSON.stringify(data);
  }
  
  // EXISTING: Rest er uændret
  // ...
}

// ADD: Ny helper method (påvirker ikke eksisterende)
_buildApiUrlWithQuery(endpoint, queryParams) {
  const url = this._buildApiUrl(endpoint);
  const params = new URLSearchParams(queryParams);
  return `${url}?${params.toString()}`;
}
```

**2. warpmind.js** - Pure addition

```javascript
class WarpMind extends BaseClient {
  constructor(config = {}) {
    super(config);
    // EXISTING: All existing initialization - UNCHANGED
    // ...
  }
  
  // EXISTING METHODS - ALL UNCHANGED
  async chat(messages, options = {}) { /* unchanged */ }
  async streamChat(messages, onChunk, options = {}) { /* unchanged */ }
  async complete(prompt, options = {}) { /* unchanged */ }
  // ... all other existing methods
  
  // ============================================
  // NEW METHODS - PURE ADDITIONS
  // ============================================
  
  async respond(input, options = {}) {
    // Import response client on demand (lazy load)
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.respond(this, input, options);
  }
  
  async streamRespond(input, onChunk, options = {}) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.streamRespond(this, input, onChunk, options);
  }
  
  async getResponse(responseId, options = {}) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.getResponse(this, responseId, options);
  }
  
  async deleteResponse(responseId) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.deleteResponse(this, responseId);
  }
  
  async cancelResponse(responseId) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.cancelResponse(this, responseId);
  }
  
  async respondBackground(input, options = {}) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.respondBackground(this, input, options);
  }
  
  createConversation(options = {}) {
    const { Conversation } = require('./conversations/conversation.js');
    return new Conversation(this, options);
  }
  
  async countResponseTokens(options) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.countTokens(this, options);
  }
}
```

**3. response-client.js** - Helt ny fil

```javascript
// NY FIL - ingen påvirkning af eksisterende kode
// Static methods pattern - tager mind instance som parameter

class ResponseClient {
  /**
   * Main respond implementation
   */
  static async respond(mind, input, options = {}) {
    // Convert input format
    const convertedInput = this._convertInput(input);
    
    const requestData = {
      model: options.model || mind.model,
      input: convertedInput,
      temperature: options.temperature !== undefined ? options.temperature : mind.temperature
    };
    
    // Add instructions if provided
    if (options.instructions) {
      requestData.instructions = options.instructions;
    }
    
    // Add other Responses API specific options
    if (options.previous_response_id) requestData.previous_response_id = options.previous_response_id;
    if (options.max_output_tokens) requestData.max_output_tokens = options.max_output_tokens;
    if (options.store !== undefined) requestData.store = options.store;
    if (options.reasoning) requestData.reasoning = options.reasoning;
    // ... other options
    
    // Include tools if registered (GENBRUGE eksisterende system)
    if (mind._tools && mind._tools.length > 0) {
      requestData.tools = mind._tools.map(t => t.schema);
      requestData.tool_choice = 'auto';
    }
    
    const response = await mind.makeRequest('/responses', requestData, {
      timeoutMs: options.timeoutMs
    });
    
    // Handle tool calls if present
    if (this._hasToolCalls(response.output)) {
      return await this._handleToolCalls(mind, response, input, options);
    }
    
    // Extract and return simplified format
    return {
      text: response.output_text || this._extractText(response.output),
      id: response.id,
      usage: response.usage
    };
  }
  
  static async streamRespond(mind, input, onChunk, options = {}) {
    // Similar structure for streaming
    // Use existing SSE parser or create new one
  }
  
  static async getResponse(mind, responseId, options = {}) {
    return await mind.makeRequest(`/responses/${responseId}`, null, {
      method: 'GET',
      queryParams: options
    });
  }
  
  static async deleteResponse(mind, responseId) {
    return await mind.makeRequest(`/responses/${responseId}`, null, {
      method: 'DELETE'
    });
  }
  
  static async cancelResponse(mind, responseId) {
    return await mind.makeRequest(`/responses/${responseId}/cancel`, {}, {
      method: 'POST'
    });
  }
  
  static async respondBackground(mind, input, options = {}) {
    return await this.respond(mind, input, {
      ...options,
      background: true,
      store: true
    });
  }
  
  static async countTokens(mind, options) {
    return await mind.makeRequest('/responses/input_tokens', options, {
      method: 'POST'
    });
  }
  
  // Private helpers
  static _convertInput(input) {
    // See Input Format Conversion section
  }
  
  static _hasToolCalls(output) {
    return output && output.some(item => item.type === 'function_call');
  }
  
  static async _handleToolCalls(mind, response, originalInput, options) {
    // Execute tools using mind._executeTool()
    // Recurse with results
    // Similar pattern to chat() tool handling
  }
  
  static _extractText(output) {
    return output
      .filter(item => item.type === 'message')
      .flatMap(item => item.content.filter(c => c.type === 'output_text'))
      .map(c => c.text)
      .join('\n');
  }
}

module.exports = { ResponseClient };
```

**4. conversation.js** - Helt ny fil

```javascript
// NY FIL - ingen påvirkning af eksisterende kode

class Conversation {
  constructor(mind, options = {}) {
    this.mind = mind;
    this.instructions = options.instructions;
    this.previousResponseId = null;
    this.history = []; // Client-side backup
  }
  
  async respond(input, options = {}) {
    const requestOptions = {
      ...options,
      instructions: this.instructions
    };
    
    // Use previous_response_id for chaining (primary approach)
    if (this.previousResponseId) {
      requestOptions.previous_response_id = this.previousResponseId;
    }
    
    const response = await this.mind.respond(input, requestOptions);
    
    // Update state
    if (response.id) {
      this.previousResponseId = response.id;
    }
    
    // Keep client-side backup
    this.history.push(
      { role: 'user', content: input },
      { role: 'assistant', content: response.text }
    );
    
    return response;
  }
  
  async streamRespond(input, onChunk, options = {}) {
    // Similar pattern for streaming
    const requestOptions = {
      ...options,
      instructions: this.instructions,
      previous_response_id: this.previousResponseId
    };
    
    const response = await this.mind.streamRespond(input, onChunk, requestOptions);
    
    if (response.id) {
      this.previousResponseId = response.id;
    }
    
    this.history.push(
      { role: 'user', content: input },
      { role: 'assistant', content: response.text }
    );
    
    return response;
  }
  
  async clear() {
    this.history = [];
    this.previousResponseId = null;
  }
  
  getHistory() { 
    return this.history; 
  }
  
  // Export/import for client-side backup (localStorage)
  exportHistory() {
    return JSON.stringify({
      history: this.history,
      previousResponseId: this.previousResponseId
    });
  }
  
  importHistory(data) {
    const parsed = JSON.parse(data);
    this.history = parsed.history;
    this.previousResponseId = parsed.previousResponseId;
  }
}

module.exports = { Conversation };
```

**Integration i `src/warpmind.js`:**

```javascript
// ADD - ny metode
createConversation(options = {}) {
  const { Conversation } = require('./conversations/conversation.js');
  return new Conversation(this, options);
}
```

**Browser storage support:**
```javascript
// Usage example - auto-save to localStorage
const conv = mind.createConversation({ instructions: 'You are helpful' });

// After each response, save state
await conv.respond('Hello');
localStorage.setItem('conversation', conv.exportHistory());

// Restore later
const restoredConv = mind.createConversation();
restoredConv.importHistory(localStorage.getItem('conversation'));
```

### Fordele ved Denne Tilgang

1. **Zero Risk** - Eksisterende funktionalitet kan ikke påvirkes
2. **Gradvis Adoption** - Brugere kan migrere i deres eget tempo
3. **Easy Testing** - Nye features kan testes isoleret
4. **Clear Separation** - Responses logic er i separate filer
5. **Lazy Loading** - Responses API code loades kun hvis brugt
6. **Rollback Safe** - Kan fjerne nye features uden at påvirke gamle

### Migration Path for Brugere

```javascript
// Step 1: Start med eksisterende API (no changes needed)
const mind = new WarpMind({ baseURL: '...' });
await mind.chat("Hello");

// Step 2: Prøv nye features når klar (opt-in)
await mind.respond("Hello");

// Step 3: Brug avancerede features efter behov
const conv = mind.createConversation();
await conv.respond("Hello");

// Step 4: Eksisterende API virker stadig (parallel support)
await mind.chat("Still works!");
```

### Code Review Checklist

Før merge af Responses API implementation:
- ✅ Alle eksisterende tests skal passe - ingen ændringer
- ✅ Ingen ændringer i eksisterende method signatures
- ✅ Ingen ændringer i eksisterende return types
- ✅ Nye metoder er tydeligt markeret i documentation
- ✅ Backward compatibility verificeret med integration tests
- ✅ Bundle size impact er minimal (lazy loading)

---

## Implementation Phases

### Phase 1: Core Respond Method

**Fil: `src/core/response-client.js`** (NY FIL - ingen påvirkning af eksisterende)

Ny module der håndterer responses API specifics:
- Request/response mapping
- Input format conversion (string → input array, messages → items)
- Output parsing (output array → text extraction)
- Error handling

**Integration i `src/warpmind.js`:** (PURE ADDITION - ingen ændringer af eksisterende metoder)

```javascript
// ADD til WarpMind class - EFTER alle eksisterende metoder

async respond(input, options = {}) {
  const { ResponseClient } = require('./core/response-client.js');
  return await ResponseClient.respond(this, input, options);
}

async streamRespond(input, onChunk, options = {}) {
  const { ResponseClient } = require('./core/response-client.js');
  return await ResponseClient.streamRespond(this, input, onChunk, options);
}
```

**Modificationer i `src/core/base-client.js`:** (MINIMAL - kun udvidelse)

```javascript
// CHANGE: Udvid makeRequest signature (bevarer bagudkompatibilitet)
async makeRequest(endpoint, data, options = {}) {
  const method = options.method || 'POST';  // Default 'POST' = existing behavior
  // ... rest unchanged
}

// ADD: Ny helper (påvirker ikke eksisterende)
_buildApiUrlWithQuery(endpoint, queryParams) {
  // ...
}
```

### Phase 2: Response Management

**Response retrieval:** (NY metoder i warpmind.js)

```javascript
// ADD - nye metoder i WarpMind class

async getResponse(responseId, options = {}) {
  return await this.makeRequest(`/responses/${responseId}`, null, {
    method: 'GET',
    queryParams: options
  });
}

async deleteResponse(responseId) {
  return await this.makeRequest(`/responses/${responseId}`, null, {
    method: 'DELETE'
  });
}

async cancelResponse(responseId) {
  return await this.makeRequest(`/responses/${responseId}/cancel`, null, {
    method: 'POST'
  });
}
```

**Background execution:** (NY metode - convenience helper)

```javascript
// ADD - ny convenience method
async respondBackground(input, options = {}) {
  return await this.respond(input, {
    ...options,
    background: true,
    store: true // Required for background
  });
}
```

**Token counting:** (NY metode - ingen påvirkning af eksisterende)

```javascript
// ADD - helt ny feature
async countResponseTokens(options) {
  return await this.makeRequest('/responses/input_tokens', options);
}
```

**INGEN ændringer i:**
- Eksisterende modules (audio, vision, memory, pdf, data-processing)
- Eksisterende streaming logic
- Eksisterende tool system
- Eksisterende error handling

## Base Client Updates

`src/core/base-client.js` skal udvides til at supportere:

1. **GET requests** (ikke kun POST)
2. **DELETE requests** 
3. **Query parameters** (til pagination, include, etc)

**VIGTIGT: Alle ændringer skal være bagudkompatible - default behavior er uændret.**

```javascript
// BEFORE: Understøttede kun POST
async makeRequest(endpoint, data, options = {}) {
  // ... hardcoded method: 'POST'
}

// AFTER: Understøtter flere methods, men default er stadig POST
async makeRequest(endpoint, data, options = {}) {
  const method = options.method || 'POST';  // DEFAULT: 'POST' (eksisterende adfærd)
  const queryParams = options.queryParams || {};
  
  // Build URL with query params (kun hvis angivet)
  const url = Object.keys(queryParams).length > 0
    ? this._buildApiUrlWithQuery(endpoint, queryParams)
    : this._buildApiUrl(endpoint);  // Eksisterende method - uændret
  
  const fetchOptions = {
    method: method,  // CHANGED: fra hardcoded 'POST'
    headers: {
      'Content-Type': 'application/json',
      'api-key': this.apiKey
    },
    signal: controller ? controller.signal : undefined
  };
  
  // Skip body for GET/DELETE (ny logik - påvirker ikke POST)
  if (data && method !== 'GET' && method !== 'DELETE') {
    fetchOptions.body = JSON.stringify(data);
  }
  
  // Rest af retry logic, error handling, etc. - UÆNDRET
  // ...
}

// ADD: Ny helper method (påvirker ikke eksisterende _buildApiUrl)
_buildApiUrlWithQuery(endpoint, queryParams) {
  const url = this._buildApiUrl(endpoint);  // Genbruger eksisterende
  const params = new URLSearchParams(queryParams);
  return `${url}?${params.toString()}`;
}
```

**Verificering af bagudkompatibilitet:**

```javascript
// Alle disse skal virke præcis som før:
await client.makeRequest('/chat/completions', data);  
// → POST, ingen query params, body included ✅

await client.makeRequest('/chat/completions', data, { timeoutMs: 5000 });
// → POST, timeout works, body included ✅

// Nye capabilities - kun aktive hvis angivet:
await client.makeRequest('/responses/123', null, { method: 'GET' });
// → GET, no body ✅

await client.makeRequest('/responses', null, { 
  method: 'GET',
  queryParams: { limit: 10 }
});
// → GET with query params ✅
```

## Streaming Updates

Responses API streaming format er anderledes end Chat Completions.

**Anbefaling: Genbruge eksisterende SSE parser med event type detection**

Eksisterende `sse-parser.js` kan udvides til at håndtere begge formater via event type detection.

### Event Format Comparison

**Chat Completions:**
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
```

**Responses API:**
```
event: response.output_text.delta
data: {"type":"response.output_text.delta","text":"Hello"}
```

### Implementation Strategy

Tilføj event type håndtering i eksisterende parser:

```javascript
// In sse-parser.js
function parseEvent(eventType, data) {
  // Responses API format
  if (eventType === 'response.output_text.delta') {
    return { delta: data.text };
  }
  if (eventType === 'response.function_call_arguments.delta') {
    return { tool_calls: [/* parse tool call */] };
  }
  if (eventType === 'response.done') {
    return { done: true, response: data.response };
  }
  
  // Chat Completions format (no event type)
  if (!eventType && data.choices) {
    return { delta: data.choices[0]?.delta?.content };
  }
  
  return null;
}
```

### Responses API Event Types

- `response.created` - Response startet
- `response.output_item.added` - Nyt output item
- `response.output_text.delta` - Text chunk (PRIMÆR)
- `response.output_text.done` - Text færdig
- `response.function_call_arguments.delta` - Function args streaming
- `response.function_call.done` - Function call færdig
- `response.done` - Hele response færdig (VIGTIG)
- `response.error` - Error opstod

**Bemærk**: `response.done` event indeholder fuld response object inkl. usage - vigtigt for at få token counts.

## Error Handling Strategy

### Response Status Handling

```javascript
// In ResponseClient.respond()
if (response.status === 'failed') {
  throw new Error(`Response failed: ${response.error?.message || 'Unknown error'}`);
}

if (response.status === 'incomplete') {
  // Partial response - decide how to handle
  console.warn('Incomplete response:', response.incomplete_details);
  // Option 1: Return what we have
  // Option 2: Throw error
  // Option 3: Retry with truncation: 'auto'
}
```

### Empty Output Handling

```javascript
static _extractText(output) {
  if (!output || output.length === 0) {
    return ''; // Empty response
  }
  
  const textItems = output
    .filter(item => item.type === 'message')
    .flatMap(item => item.content?.filter(c => c.type === 'output_text') || [])
    .map(c => c.text);
  
  return textItems.length > 0 ? textItems.join('\n') : '';
}
```

### Tool Execution Errors

Tool errors håndteres allerede i eksisterende `_executeTool()` method:

```javascript
// Existing pattern in warpmind.js - GENBRUGES
try {
  const result = await tool.handler(args);
  return result;
} catch (error) {
  // Tool error - send back to model
  return { error: error.message };
}
```

Samme pattern anvendes i Responses API tool handling.

### Background Task Errors

```javascript
const result = await mind.getResponse(taskId);

if (result.status === 'failed') {
  throw new Error(`Background task failed: ${result.error?.message}`);
}

if (result.status === 'cancelled') {
  throw new Error('Background task was cancelled');
}
```

### From Chat Completions to Responses

| Chat Completions | Responses API | Notes |
|-----------------|---------------|-------|
| `messages` | `input` | Array of items eller string |
| `messages[0]` (system) | `instructions` | System message → instructions |
| `stream` | `stream` | Same |
| `temperature` | `temperature` | Same |
| `tools` | `tools` | Same format |
| `tool_choice` | `tool_choice` | Same |
| N/A | `previous_response_id` | New: chaining |
| N/A | `conversation` | New: stateful |
| N/A | `background` | New |
| N/A | `store` | New (default true) |
| N/A | `max_output_tokens` | Replaces max_tokens |
| N/A | `reasoning` | New: for o-series |

### Input Format Conversion

**WarpMind skal konvertere mellem formater automatisk i ResponseClient.**

| Input Type | WarpMind Format | Responses API Format |
|------------|----------------|---------------------|
| String | `"Hello"` | `"Hello"` (sent as-is) |
| Simple message | `[{role: 'user', content: 'Hello'}]` | `[{type: 'message', role: 'user', content: [{type: 'input_text', text: 'Hello'}]}]` |
| Image + text (from analyzeImage) | File/Blob/URL + prompt | `[{type: 'input_text', text: '...'}, {type: 'input_image', image_url: {url: 'data:...'}}]` |
| Multi-turn messages | `[{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]` | Same structure but wrapped in message items |

**Conversion logic pseudocode:**

```javascript
function convertInputToResponsesFormat(input) {
  // String - pass through
  if (typeof input === 'string') {
    return input;
  }
  
  // Array - check structure
  if (Array.isArray(input)) {
    // Already in Responses format (has type property)?
    if (input[0]?.type) {
      return input;
    }
    
    // Chat Completions format (has role/content)?
    if (input[0]?.role) {
      return input.map(msg => ({
        type: 'message',
        role: msg.role,
        content: Array.isArray(msg.content) 
          ? msg.content.map(c => convertContentItem(c))
          : [{type: 'input_text', text: msg.content}]
      }));
    }
  }
  
  throw new Error('Invalid input format');
}

function convertContentItem(item) {
  if (item.type === 'text') {
    return {type: 'input_text', text: item.text};
  }
  if (item.type === 'image_url') {
    return {type: 'input_image', image_url: item.image_url};
  }
  return item; // Already correct format
}
```

## Backward Compatibility

### Keep chat() as primary for beginners
```javascript
// Simple use case → chat()
const answer = await mind.chat("What is 2+2?");
```

### Advanced users → respond()
```javascript
// Multi-turn, background, reasoning → respond()
const conv = mind.createConversation();
await conv.respond("Help me code");
```

### Internal decision logic
Kunne overveje at lade chat() bruge responses API internt når visse features er aktive:
- Hvis `previous_response_id` passes → use responses
- Hvis `background: true` → use responses
- Ellers → use chat completions

Men start med dem som separate methods for klarhed.

## Testing Strategy

1. **Unit tests** for input/output mapping
2. **Integration tests** for actual API calls
3. **Conversation tests** for multi-turn scenarios
4. **Backward compatibility tests** - ensure chat() still works
5. **Streaming tests** for both APIs

## Documentation Updates

### README additions:
- New "Advanced: Responses API" section
- Conversation management examples
- Background execution guide
- Migration guide (chat → respond)

### Examples to create:
- `examples/conversation-demo.html` - Multi-turn conversation UI
- `examples/background-processing-demo.html` - Long-running tasks
- `examples/response-comparison.html` - Chat vs Respond side-by-side

## Yderligere Features fra Guides

### Developer Role (Ny i Responses API)

Der er nu en `developer` rolle der har højere prioritet end `system`:

```javascript
// Hierarchy: developer > system > user
await mind.respond([
  { role: 'system', content: 'Talk like a pirate' },
  { role: 'developer', content: 'Don\'t talk like a pirate' }, // wins
  { role: 'user', content: 'Hello' }
]);
```

Dette giver bedre kontrol over prompt hierarchies.

### Store Parameter

Responses kan gemmes server-side på OpenAI:

```javascript
// Store response (default: true)
const resp = await mind.respond("Hello", { store: true });

// Don't store (for privacy/compliance)
const resp = await mind.respond("Sensitive data", { store: false });
```

Når `store: true`:
- Response kan hentes senere via `getResponse(id)`
- Conversation history kan genbruges
- Nødvendigt for background tasks

### Include Parameter

Specificér ekstra data i responses:

```javascript
const resp = await mind.respond("Analyze this", {
  include: [
    'web_search_call.action.sources',     // Web search sources
    'file_search_call.results',           // File search results  
    'message.output_text.logprobs',       // Token probabilities
    'reasoning.encrypted_content'         // Reasoning (o-series)
  ]
});
```

### Reasoning Models (o-series)

o-series modeller har speciel reasoning support:

```javascript
const resp = await mind.respond("Write a bash script for matrix transpose", {
  model: 'o3-mini',
  reasoning: {
    effort: 'low' | 'medium' | 'high'  // Hvor meget skal modellen tænke?
  }
});

// Response inkluderer:
// - reasoning.summary: Hvad modellen tænkte
// - reasoning.encrypted_content: Encrypted reasoning (hvis included)
```

### Truncation Strategy

Håndtering af for lange inputs:

```javascript
const resp = await mind.respond(veryLongInput, {
  truncation: 'auto'  // Drop gamle messages hvis context overflow
  // eller 'disabled' (default) - fail med 400 error
});
```

### Safety Identifier

For compliance og misuse detection:

```javascript
const resp = await mind.respond(userInput, {
  safety_identifier: hashUserId(user.email)  // Hashed user ID
});
```

### Metadata

Attach custom data til responses:

```javascript
const resp = await mind.respond("Hello", {
  metadata: {
    user_id: '123',
    session_id: 'abc',
    feature: 'chatbot'
    // max 16 key-value pairs
  }
});
```

### Max Tool Calls

Limit antal tool calls:

```javascript
const resp = await mind.respond("Do research", {
  max_tool_calls: 10  // Stop efter 10 tool calls total
});
```

## Implementation Decisions

### Resolved Design Choices

1. **Conversation storage**: ✅ Client-side med `previous_response_id` chaining (simplere, fungerer i alle environments)
2. **Naming**: ✅ `respond()` / `streamRespond()` / `createConversation()` (klart anderledes end `chat()`)
3. **Error handling**: ✅ Throw errors på status='failed', warn på 'incomplete'
4. **Developer role**: ✅ Map `developer` → `instructions` automatisk i input conversion
5. **Store default**: ✅ Brug OpenAI's default (true) - ingen overrides
6. **Background polling**: ✅ Exponential backoff: 1s → 2s → 4s → 8s (max 10s)
7. **Streaming parser**: ✅ Extend existing SSE parser med event type detection
8. **ResponseClient pattern**: ✅ Static methods with lazy loading

### Open Questions (Implementation Detaljer)

1. **Max output tokens**: Skal vi defaulte til 16000 eller følge OpenAI's defaults?
2. **Conversation export format**: Skal exportHistory() også gemme instructions og model?
3. **Background task timeout**: Hvad skal max polling tid være? (suggestion: 5 minutes)
4. **Tool call limit**: Skal vi have en intern limit for max_tool_calls for at undgå infinite loops?

## Prioritering

### Must-have:
- `respond()` basic implementation
- `streamRespond()` 
- Response retrieval (`getResponse()`)
- Backward compatibility med `chat()`

### Nice-to-have:
- `createConversation()` class med både client-side storage ✅
- Background execution support med polling/status checks (via `respondBackground()` convenience method)
- Token counting utility (`countResponseTokens()`)
- Response deletion/cancellation (`deleteResponse()`, `cancelResponse()`)
- **Built-in tools** (web search, file search, computer use) - se Design Options nedenfor

### Built-in Tools Design Options

OpenAI's Responses API har 3 built-in tools: `web_search`, `file_search`, `computer_use`.

**Option A: Simple enable flags** (anbefalet - nemmest at bruge)
```javascript
await mind.respond("Research AI trends", {
  tools: ['web_search'],  // Enable built-in tool
  // WarpMind håndterer automatisk tool type detection
});
```

**Option B: Explicit format** (mere explicit - matcher OpenAI format)
```javascript
await mind.respond("Research AI trends", {
  tools: [
    { type: 'web_search' },
    { type: 'file_search', file_search: { vector_stores: ['vs_123'] } },
    { type: 'function', function: { name: 'myTool', ... } }
  ]
});
```

**Implementation Strategy:**
1. Detect tool type in `ResponseClient._convertInput()`:
   - String → built-in tool type
   - Object with `type: 'function'` → custom tool
   - Object with `type: 'web_search'` → built-in tool
2. Mix custom and built-in tools in samme array
3. Ingen ændringer til eksisterende tool system

**Example med mixed tools:**
```javascript
// Register custom tool (existing pattern)
mind.registerTool('calculate', calculateHandler, schema);

// Use with built-in tools
await mind.respond("Calculate GDP and research economy", {
  tools: [
    'calculate',        // Custom tool (shorthand)
    'web_search'        // Built-in tool
  ]
});
```

### Future:
- Reasoning model specific features og UI
- Advanced include parameters for sources/logprobs/reasoning
- Conversation export/import med full fidelity
- Response caching optimization
- MCP (Model Context Protocol) tools integration
- Prompt template support (`prompt` parameter)
- Service tier support (`flex`, `priority`)

## References

- OpenAI Responses API docs: https://platform.openai.com/docs/api-reference/responses
- OpenAI Agents SDK: https://platform.openai.com/docs/guides/agents
- OpenAI Built-in Tools: https://platform.openai.com/docs/guides/tools
- DataCamp Tutorial: https://www.datacamp.com/tutorial/openai-responses-api
- Medium Guide: https://medium.com/@odhitom09/openai-responses-api-a-comprehensive-guide-ad546132b2ed
- AI SDK Integration: https://ai-sdk.dev/cookbook/guides/openai-responses
- Current WarpMind chat implementation: `src/warpmind.js` lines 218-360
- Current streaming implementation: `src/warpmind.js` lines 445-656
- SSE parser: `src/streaming/sse-parser.js`
