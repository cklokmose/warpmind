# WarpMind Library - Development TODO

## 1. Core Transport Upgrades

### Exponential Back-off Implementation
- [ ] Add retry logic for HTTP status codes: 429, 502, 503, 524
- [ ] Implement exponential back-off algorithm:
  - [ ] Up to 5 retry attempts
  - [ ] Delay formula: `500ms × 2^attempt + jitter(0–250ms)`
  - [ ] Check for `Retry-After` header and use it instead of formula when present
- [ ] Apply retry logic to all API calls

### Timeout Handling
- [ ] Add `timeoutMs` parameter to all public methods (default: 30,000ms)
- [ ] Implement `AbortController` for request cancellation
- [ ] Create custom `TimeoutError` class
- [ ] Ensure promises reject with `TimeoutError` on timeout

### SSE Parser for Streaming
- [ ] Add dependency: `eventsource-parser` (~0.7 kB)
- [ ] Implement internal `parseSSE()` function
- [ ] Make `parseSSE()` yield `{ role, delta }` events
- [ ] Integrate SSE parser with streaming methods

## 2. Streaming & Vision Polish

### streamChat Enhancement
- [ ] Modify `streamChat` to emit `{ type: "chunk", content }` immediately to callback
- [ ] Maintain `fullResponse` internally for final resolve
- [ ] Integrate with new `parseSSE()` function

### analyzeImage Improvements
- [ ] Add `options.detail` parameter with values:
  - [ ] `"low"` (default)
  - [ ] `"high"`
- [ ] Pass `detail` property inside the image object to API
- [ ] Add documentation warning: `"high"` detail ≈ 2× token cost

### textToSpeech Streaming
- [ ] Add `options.stream` parameter (boolean)
- [ ] When `stream === true`, stream binary chunks
- [ ] Call `/audio/speech` endpoint with:
  ```json
  {
    "voice": "alloy",
    "format": "opus", 
    "stream": true
  }
  ```
- [ ] Optional dependency: `opus-media-recorder`

### speechToText Streaming
- [ ] Add `options.stream` parameter (boolean)
- [ ] When `stream === true`, use transcriptions-stream endpoint
- [ ] Emit partial transcripts via `onPartial` callback
- [ ] Implement fallback to current sync path on server error

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
- ✅ Maintain backward compatibility
- ✅ All new features should be opt-in where applicable
