# WarpMind Library - Development TODO

## ✅ COMPLETED: Phase 1 & 2 - Infrastructure & Streaming Refactoring

**Date Completed**: Current
**Summary**: Successfully extracted core infrastructure and streaming functionality from the monolithic `warpmind.js` file into focused, reusable modules.

### What was accomplished:

**Phase 1 - Base Infrastructure:**
- ✅ Created `src/core/base-client.js` (147 lines) containing:
  - `BaseClient` class with constructor, configuration methods
  - `makeRequest()` method with full retry logic and timeout handling
  - `TimeoutError` class
  - All HTTP client configuration and error handling
- ✅ Refactored `src/warpmind.js` to extend `BaseClient`

**Phase 2 - Streaming Functionality:**
- ✅ Created `src/streaming/sse-parser.js` (91 lines) containing:
  - `parseSSE()` function for Server-Sent Events parsing
  - All SSE-related imports and utilities
  - Environment-compatible eventsource-parser integration
- ✅ Updated `src/warpmind.js` to use modular SSE parser
- ✅ Maintained backward compatibility via method binding

### Current Status:
- ✅ All 71 tests pass successfully
- ✅ Build system works correctly (webpack bundle is now 12.9 KiB)
- ✅ Student-facing API remains completely unchanged
- ✅ Reduced `warpmind.js` from ~900 lines to 751 lines

**Impact**: Created solid foundation with clean separation of concerns. Ready for further modularization phases.

---

## PRIORITY: Code Refactoring & Modularity

### File Structure Reorganization (warpmind.js is ~900 lines - too large!)

**Goal**: Split the monolithic `src/warpmind.js` file into focused, maintainable modules while preserving the exact same student-facing API.

#### Phase 1: Create Base Infrastructure ✅ COMPLETED
- [x] Create `src/core/base-client.js` - HTTP client with retry logic and error handling
  - [x] Move `makeRequest()` method
  - [x] Move constructor and configuration methods (`setApiKey`, `setBaseURL`, `setModel`, `configure`)
  - [x] Move timeout and retry coordination logic
  - [x] Export `BaseClient` class and `TimeoutError`
- [x] Update `src/warpmind.js` to extend `BaseClient`
- [x] Remove duplicate code and ensure all tests pass
- [x] Verify build succeeds

#### Phase 2: Extract Streaming Functionality ✅ COMPLETED
- [x] Create `src/streaming/sse-parser.js` - Server-Sent Events handling
  - [x] Move `parseSSE()` method
  - [x] Move SSE-related utilities and createParser import
  - [x] Export streaming functions
- [x] Update `src/warpmind.js` to import and use the SSE parser module
- [x] Maintain backward compatibility by binding parseSSE method to Warpmind class
- [x] All tests pass and build succeeds

#### Phase 3: Extract Audio Module
- [ ] Create `src/modules/audio.js` - All audio-related operations (~300 lines)
  - [ ] Move `textToSpeech()` method
  - [ ] Move `speechToText()` method  
  - [ ] Move `playAudio()` utility method
  - [ ] Export as module function that accepts client instance

#### Phase 4: Extract Vision Module
- [ ] Create `src/modules/vision.js` - Image analysis operations (~100 lines)
  - [ ] Move `analyzeImage()` method
  - [ ] Move `_fileToBase64()` helper method
  - [ ] Export as module function that accepts client instance

#### Phase 5: Extract Voice Chat Controller
- [ ] Create `src/modules/voice-chat.js` - Interactive voice conversation (~150 lines)
  - [ ] Move `createVoiceChat()` method and its returned object
  - [ ] Move MediaRecorder integration logic
  - [ ] Move conversation management logic
  - [ ] Export as module function that accepts client instance

#### Phase 6: Extract Data Processing Module
- [ ] Create `src/modules/data-processing.js` - Structured JSON processing (~100 lines)
  - [ ] Move `process()` method
  - [ ] Move schema validation logic
  - [ ] Move retry logic specific to JSON processing
  - [ ] Export as module function that accepts client instance

#### Phase 7: Update Main Warpmind Class
- [ ] Refactor `src/warpmind.js` to be the main coordinator (~200 lines)
  - [ ] Extend `BaseClient` instead of implementing HTTP logic
  - [ ] Import and mix in all module functions
  - [ ] Keep core chat methods (`chat`, `complete`, `ask`, `streamChat`)
  - [ ] Maintain exact same public API
  - [ ] Ensure all tests still pass

#### Phase 8: Module Integration Pattern
```javascript
// Each module exports a function that receives the client instance
// and returns an object with methods to be mixed into the main class

// Example: src/modules/audio.js
module.exports = function(client) {
  return {
    async textToSpeech(text, options = {}) {
      // Implementation using client.makeRequest()
    },
    async speechToText(audioFile, options = {}) {
      // Implementation using client.makeRequest()
    },
    async playAudio(audioBlob) {
      // Utility method
    }
  };
};

// Main warpmind.js
const AudioModule = require('./modules/audio');
const VisionModule = require('./modules/vision');
// ... other modules

class Warpmind extends BaseClient {
  constructor(config = {}) {
    super(config);
    
    // Mix in module methods
    Object.assign(this, AudioModule(this));
    Object.assign(this, VisionModule(this));
    // ... other modules
  }
}
```

#### Benefits Expected:
- **Maintainability**: Each file ~100-200 lines instead of 900
- **Testability**: Modules can be tested independently
- **Development**: Multiple developers can work on different modules
- **Bundle optimization**: Tree-shaking friendly for smaller bundles
- **Code organization**: Single responsibility per module
- **Student API**: No changes to the learning experience

#### Validation Requirements:
- [ ] All 71 existing tests must continue to pass
- [ ] No changes to student-facing API
- [ ] Webpack build must succeed
- [ ] All HTML examples must continue to work
- [ ] Bundle size should not increase significantly

---

## 1. Core Transport Upgrades

### Exponential Back-off Implementation
- [x] Add retry logic for HTTP status codes: 429, 502, 503, 524
- [x] Implement exponential back-off algorithm:
  - [x] Up to 5 retry attempts
  - [x] Delay formula: `500ms × 2^attempt + jitter(0–250ms)`
  - [x] Check for `Retry-After` header and use it instead of formula when present
- [x] Apply retry logic to all API calls

### Timeout Handling
- [x] Add `timeoutMs` parameter to all public methods (default: 30,000ms)
- [x] Implement `AbortController` for request cancellation
- [x] Create custom `TimeoutError` class
- [x] Ensure promises reject with `TimeoutError` on timeout

### SSE Parser for Streaming
- [x] Add dependency: `eventsource-parser` (~0.7 kB)
- [x] Implement internal `parseSSE()` function
- [x] Make `parseSSE()` yield `{ role, delta }` events
- [x] Integrate SSE parser with streaming methods

## 2. Streaming & Vision Polish

### streamChat Enhancement
- [x] Modify `streamChat` to emit `{ type: "chunk", content }` immediately to callback
- [x] Maintain `fullResponse` internally for final resolve
- [x] Integrate with new `parseSSE()` function

### analyzeImage Improvements
- [x] Add `options.detail` parameter with values:
  - [x] `"low"` (default)
  - [x] `"high"`
- [x] Pass `detail` property inside the image object to API
- [ ] Add documentation warning: `"high"` detail ≈ 2× token cost

### textToSpeech Streaming
- [x] Add `options.stream` parameter (boolean)
- [x] When `stream === true`, stream binary chunks
- [x] Call `/audio/speech` endpoint with:
  ```json
  {
    "voice": "alloy",
    "format": "opus", 
    "stream": true
  }
  ```
- [x] Add `options.onChunk` callback for streaming chunks
- [x] Use proper Authorization header format
- [ ] Optional dependency: `opus-media-recorder`

### speechToText Streaming
- [x] Add `options.stream` parameter (boolean)
- [x] Add `options.onPartial` callback for partial transcripts
- [x] Implement client-side simulated streaming for better UX
- [x] Use proper Authorization header format
- [x] Handle API errors gracefully with proper error messages

## 3. Tool Calling System (Optional, Default Off)

### API Design
- [ ] Implement `mind.registerTool()` method with schema:
  ```javascript
  mind.registerTool({
    name: 'searchLibrary',
    description: 'Searches school library by title',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title']
    },
    handler: async (args) => { /* … */ }
  });
  ```

### Internal Implementation
- [ ] Add `this._tools = []` array to store `{ schema, handler }`
- [ ] Modify `chat()` method:
  - [ ] Include `tools: this._tools.map(t => t.schema)` when tools exist
- [ ] After each chat response:
  - [ ] Inspect `tool_calls` in response
  - [ ] For each tool call:
    - [ ] Locate matching handler and execute it
    - [ ] Push result into message list as `{ role: "tool", content: JSON.stringify(result) }`
    - [ ] Re-invoke `chat()` to let model finish
- [ ] Implement depth limit of 2 callback rounds to prevent loops

## 4. Quality-of-Life Improvements

### Usage Information
- [ ] Modify all generation methods to return:
  ```javascript
  { 
    text: "response text", 
    usage: response.usage 
  }
  ```
- [ ] Enable teachers to inspect token usage

### voiceChat Controller
- [ ] Add `.abort()` method that:
  - [ ] Stops recorder
  - [ ] Tracks properly even when STT/TTS fails
  - [ ] Ensures promise rejects only once

### Documentation Updates
- [ ] Update README with:
  - [ ] New `detail` parameter for image analysis
  - [ ] New streaming flags for audio methods
  - [ ] `timeoutMs` parameter documentation

## 5. Final Deliverables

### Build & Distribution
- [ ] Generate updated `dist/warpmind.js` (single file)
- [ ] Ensure no breaking changes to existing examples
- [ ] Test all examples still work:
  - [ ] `basic-example.html`
  - [ ] `chat-interface.html`
  - [ ] `complete-test-suite.html`
  - [ ] `multi-modal-example.html`

### Documentation
- [ ] Create minimal README diffs
- [ ] Document new parameters and features
- [ ] Add bullet points for new functionality

## Notes
- ✅ Keep existing functionality intact: moderation, key security, header logic, Assistants v2, typings, and token accounting
- ✅ Maintain backward compatibility during development phase
- ✅ **COMPLETED**: Cleaned up backward compatibility code since library is not yet in production
- ✅ All new features should be opt-in where applicable
