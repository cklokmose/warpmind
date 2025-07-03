/**
 * Server-Sent Events (SSE) parser module for streaming functionality
 * Handles robust parsing of SSE streams from OpenAI-compatible APIs
 */

// Import eventsource-parser for robust SSE parsing (compatible with browser and Node.js)
let createParser;

if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  try {
    createParser = require('eventsource-parser').createParser;
  } catch (error) {
    throw new Error('eventsource-parser is required for SSE streaming support. Please install it with: npm install eventsource-parser');
  }
} else {
  // Browser environment - webpack should bundle eventsource-parser
  try {
    // Use dynamic import that webpack can resolve
    const EventSourceParser = require('eventsource-parser');
    createParser = EventSourceParser.createParser;
  } catch (error) {
    throw new Error('eventsource-parser is required for SSE streaming support. Please ensure it is bundled with your application.');
  }
}

/**
 * Parse Server-Sent Events (SSE) stream from a ReadableStream
 * @param {ReadableStreamDefaultReader} reader - Stream reader
 * @param {function} onEvent - Callback for each parsed event
 * @returns {Promise<string>} - Complete accumulated response
 */
async function parseSSE(reader, onEvent) {
  const decoder = new TextDecoder();
  let fullResponse = '';
  
  // Create the SSE parser
  const parser = createParser((event) => {
    if (event.type === 'event') {
      if (event.data === '[DONE]') {
        return;
      }
      
      try {
        const parsed = JSON.parse(event.data);
        const delta = parsed.choices?.[0]?.delta;
        
        if (delta) {
          const eventData = {
            role: delta.role || 'assistant'
          };
          
          // Handle content delta
          if (delta.content !== undefined) {
            eventData.delta = delta.content;
            fullResponse += delta.content;
          }
          
          // Handle tool calls delta
          if (delta.tool_calls) {
            eventData.tool_calls = delta.tool_calls;
          }
          
          if (onEvent) onEvent(eventData);
        }
      } catch (error) {
        console.warn('Failed to parse SSE event:', error.message);
      }
    }
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Feed the chunk to the parser
      const chunk = decoder.decode(value, { stream: true });
      parser.feed(chunk);
    }
  } catch (error) {
    throw new Error(`SSE parsing failed: ${error.message}`);
  }

  return fullResponse;
}

// Export the function and createParser for use by other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseSSE,
    createParser
  };
} else {
  // Browser environment
  window.SSEParser = {
    parseSSE,
    createParser
  };
}
