# Tool Calling Inspection Plan

## Overview

This document outlines a plan for implementing tool call inspection and user notification in WarpMind. The goal is to provide developers with visibility into when and how AI tools are being invoked during chat sessions, processing, and other operations.

## Current State

Currently, WarpMind's tool calling system operates transparently without providing developers visibility into:
- When tools are called
- Which tools are being invoked
- What parameters are passed to tools
- What results tools return
- Whether tool calls succeed or fail

The main methods that can trigger tool calls are:
- `chat()` - Returns only a string response
- `streamChat()` - Streams response chunks
- `process()` - Processes content with potential tool usage
- `complete()` - Completes text with potential tool usage

## Design Goals

1. **Non-breaking**: Existing code should continue to work without modifications
2. **Optional**: Tool call inspection should be opt-in
3. **Flexible**: Support different notification mechanisms for different use cases
4. **Performant**: Minimal overhead when inspection is disabled
5. **Comprehensive**: Cover all tool calling scenarios
6. **Developer-friendly**: Easy to integrate and use

## Proposed Solution

### 1. Callback-Based Approach

Add optional callback parameters to tool-enabled methods:

```javascript
// Method signature enhancement
async chat(message, options = {}) {
  const {
    onToolCall = null,      // Called when a tool is invoked
    onToolResult = null,    // Called when a tool completes
    onToolError = null,     // Called when a tool fails
    // ...existing options
  } = options;
}
```

### 2. Callback Interface Definition

```javascript
// Tool call notification callbacks
const toolCallbacks = {
  onToolCall: (toolCall) => {
    // toolCall: { name, parameters, timestamp, callId }
    console.log(`Tool called: ${toolCall.name}`, toolCall.parameters);
  },
  
  onToolResult: (toolResult) => {
    // toolResult: { callId, name, result, duration, timestamp }
    console.log(`Tool completed: ${toolResult.name}`, toolResult.result);
  },
  
  onToolError: (toolError) => {
    // toolError: { callId, name, error, duration, timestamp }
    console.error(`Tool failed: ${toolError.name}`, toolError.error);
  }
};
```

### 3. Enhanced Return Objects (Alternative/Additional)

For methods that can benefit from richer return data (`chat()` and `process()` methods):

```javascript
// Enhanced return format (opt-in via returnMetadata flag)
const result = await client.chat(message, { 
  returnMetadata: true,
  onToolCall: callbacks.onToolCall 
});

// result structure:
{
  response: "The actual response text",
  metadata: {
    toolCalls: [
      {
        id: "call_123",
        name: "search_pdf_document",
        parameters: { query: "example" },
        result: { ... },
        duration: 1250,
        timestamp: "2025-07-09T10:00:00Z"
      }
    ],
    totalDuration: 2500,
    tokensUsed: 150
  }
}

// Works with both chat() and process() methods
const processResult = await client.process(content, { 
  returnMetadata: true 
});
// processResult has the same enhanced structure
```

### 4. Streaming Integration

For `streamChat()`, tool call notifications can be sent through callbacks while maintaining the streaming response (note: `streamChat()` does not support `returnMetadata` due to its streaming nature):

```javascript
for await (const chunk of client.streamChat(message, { 
  onToolCall: callbacks.onToolCall 
})) {
  // Regular streaming chunks
  console.log(chunk);
}
```

**Methods supporting tool call inspection:**
- `chat()` - Supports callbacks and `returnMetadata`
- `streamChat()` - Supports callbacks only (streaming responses cannot include metadata)
- `process()` - Supports callbacks and `returnMetadata`
- `complete()` - Supports callbacks only (typically returns simple strings)
```

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Tool Call Tracking System**
   - Implement `ToolCallTracker` class to manage call lifecycle
   - Generate unique call IDs for correlation
   - Track timing and status of tool calls

2. **Callback Integration Points**
   - Identify all tool invocation points in the codebase
   - Add callback invocation before/after tool execution
   - Implement error handling for callback failures

3. **Method Signature Updates**
   - Update `chat()`, `streamChat()`, `process()`, `complete()` signatures
   - Add options parameter expansion for tool callbacks
   - Maintain backward compatibility

### Phase 2: Enhanced Features

1. **Tool Call Metadata**
   - Collect comprehensive tool call information
   - Add timing and performance metrics

2. **Enhanced Return Objects**
   - Implement optional metadata return format for `chat()` and `process()` methods
   - Add `returnMetadata` option to these methods
   - Provide both simple and detailed response formats

3. **Basic Debugging**
   - Add built-in debug mode for tool calls
   - Create developer-friendly error messages



## Example Usage Scenarios

### Basic Tool Call Monitoring

```javascript
const client = new WarpMind({ apiKey: 'your-key' });

// Simple logging
await client.chat("Search for information about climate change", {
  onToolCall: (call) => console.log(`🔧 Using tool: ${call.name}`),
  onToolResult: (result) => console.log(`✅ Tool ${result.name} completed in ${result.duration}ms`)
});
```

### Debug Mode

```javascript
// Enable comprehensive debugging
await client.chat("Analyze this document", {
  debug: true, // Built-in debug mode
  onToolCall: (call) => {
    console.group(`Tool Call: ${call.name}`);
    console.log('Parameters:', call.parameters);
    console.log('Timestamp:', call.timestamp);
  },
  onToolResult: (result) => {
    console.log('Result:', result.result);
    console.log('Duration:', result.duration + 'ms');
    console.groupEnd();
  }
});
```

### Testing Integration

```javascript
describe('Tool calling behavior', () => {
  it('should use PDF search tool when querying documents', async () => {
    const toolCalls = [];
    
    await client.chat("What is the conclusion of the research paper?", {
      onToolCall: (call) => toolCalls.push(call)
    });
    
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toMatch(/search_pdf_/);
    expect(toolCalls[0].parameters.query).toContain('conclusion');
  });
});
```

## Technical Implementation Details

### ToolCallTracker Class

```javascript
class ToolCallTracker {
  constructor() {
    this.activeCalls = new Map();
    this.callHistory = [];
  }
  
  startCall(name, parameters) {
    const callId = this.generateCallId();
    const call = {
      callId,
      name,
      parameters,
      timestamp: new Date().toISOString(),
      startTime: performance.now()
    };
    
    this.activeCalls.set(callId, call);
    return call;
  }
  
  completeCall(callId, result) {
    const call = this.activeCalls.get(callId);
    if (call) {
      const duration = performance.now() - call.startTime;
      const completedCall = {
        ...call,
        result,
        duration,
        status: 'completed'
      };
      
      this.activeCalls.delete(callId);
      this.callHistory.push(completedCall);
      return completedCall;
    }
  }
  
  errorCall(callId, error) {
    const call = this.activeCalls.get(callId);
    if (call) {
      const duration = performance.now() - call.startTime;
      const errorCall = {
        ...call,
        error: error.message,
        duration,
        status: 'error'
      };
      
      this.activeCalls.delete(callId);
      this.callHistory.push(errorCall);
      return errorCall;
    }
  }
  
  generateCallId() {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### Integration Points

1. **Tool Registry Wrapper**
   - Wrap existing tool execution with tracking
   - Add callback invocation around tool calls
   - Implement error handling and recovery

2. **Method Enhancement**
   - Update all tool-enabled methods to accept callbacks
   - Implement non-breaking parameter handling
   - Add validation for callback functions

3. **Error Handling**
   - Ensure callback errors don't break tool execution
   - Implement fallback behavior for failed callbacks
   - Add comprehensive error logging

## Migration Strategy

### For Existing Users

1. **Backward Compatibility**
   - All existing code continues to work unchanged
   - New features are opt-in only
   - No performance impact when features are disabled

2. **Gradual Adoption**
   - Users can adopt tool call inspection incrementally
   - Start with basic logging, move to advanced features
   - Documentation and examples for common use cases

3. **Documentation Updates**
   - Update API documentation with new options
   - Add tutorial for tool call inspection
   - Provide migration examples for different use cases

## Testing Strategy

1. **Unit Tests**
   - Test callback invocation for all scenarios
   - Verify tool call metadata accuracy
   - Test error handling in callback functions

2. **Integration Tests**
   - Test tool call inspection across different methods
   - Verify streaming compatibility
   - Test performance impact measurements

3. **Performance Tests**
   - Measure overhead of tool call tracking
   - Verify minimal impact when disabled
   - Test with high-frequency tool usage

## Benefits

1. **Developer Experience**
   - Better debugging capabilities
   - Understanding of AI decision-making process
   - Improved testing and validation

2. **Production Monitoring**
   - Tool usage analytics
   - Performance monitoring
   - Error tracking and alerting

3. **User Experience**
   - Real-time feedback on AI operations
   - Progress indication for long-running tools
   - Transparency in AI behavior

## Next Steps

1. Review and approve this design
2. Implement Phase 1 (Core Infrastructure)
3. Create comprehensive tests
4. Update documentation
5. Gather feedback from early adopters
6. Implement Phase 2 features based on feedback

This design provides a solid foundation for tool call inspection while maintaining the simplicity and power of the existing WarpMind API.
