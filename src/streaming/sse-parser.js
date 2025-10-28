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
 * Supports both Chat Completions API and Responses API formats
 * @param {ReadableStreamDefaultReader} reader - Stream reader
 * @param {function} onEvent - Callback for each parsed event
 * @returns {Promise<Object>} - Complete response with text and metadata
 */
async function parseSSE(reader, onEvent) {
  const decoder = new TextDecoder();
  let fullResponse = '';
  let responseId = null;
  let usage = null;
  let eventType = null;
  
  // Create the SSE parser
  const parser = createParser((event) => {
    if (event.type === 'event') {
      // Store event type for Responses API
      eventType = event.event || null;
      
      if (event.data === '[DONE]') {
        return;
      }
      
      try {
        const parsed = JSON.parse(event.data);
        
        // Responses API format (has event type)
        if (eventType) {
          handleResponsesAPIEvent(eventType, parsed);
        } 
        // Chat Completions API format (no event type)
        else {
          handleChatCompletionsEvent(parsed);
        }
      } catch (error) {
        console.warn('Failed to parse SSE event:', error.message);
      }
    }
  });

  /**
   * Handle Responses API events
   * @param {string} type - Event type (e.g., 'response.output_text.delta')
   * @param {Object} data - Event data
   */
  function handleResponsesAPIEvent(type, data) {
    const eventData = {};
    
    // Debug logging
    console.log('SSE Event Type:', type, 'Data:', data);

    switch (type) {
      case 'response.created':
        // Response object is in data.response
        responseId = data.response?.id || data.id;
        break;

      case 'response.in_progress':
        // Response is in progress, we can get ID here too
        responseId = data.response?.id || responseId;
        break;

      case 'response.output_text.delta':
        if (data.delta) {
          eventData.delta = data.delta;
          fullResponse += data.delta;
          if (onEvent) onEvent(eventData);
        }
        break;

      case 'response.output_text.done':
        // Text output complete
        break;

      case 'response.content_part.added':
      case 'response.content_part.done':
      case 'response.output_item.added':
      case 'response.output_item.done':
        // Structural events - ignore for now
        break;

      case 'response.function_call_arguments.delta':
        eventData.tool_calls = [{
          id: data.call_id,
          function: {
            name: data.name,
            arguments: data.arguments
          }
        }];
        if (onEvent) onEvent(eventData);
        break;

      case 'response.function_call.done':
        // Function call complete
        break;

      case 'response.completed':
      case 'response.done':
        // Final event with full response
        console.log('response.completed/done event received:', data);
        responseId = data.response?.id || data.id || responseId;
        usage = data.response?.usage || data.usage;
        break;

      case 'response.error':
      case 'response.failed':
        console.error('Response error:', data.error || data);
        break;

      default:
        // Ignore unknown event types (but log for debugging)
        console.log('Unknown event type:', type);
        break;
    }
  }

  /**
   * Handle Chat Completions API events
   * @param {Object} parsed - Parsed event data
   */
  function handleChatCompletionsEvent(parsed) {
    const delta = parsed.choices?.[0]?.delta;
    
    if (delta) {
      const eventData = {
        role: delta.role || 'assistant'
      };
      
      // Handle content delta
      if (delta.content !== undefined && delta.content !== null) {
        eventData.delta = delta.content;
        fullResponse += delta.content;
      }
      
      // Handle tool calls delta
      if (delta.tool_calls) {
        eventData.tool_calls = delta.tool_calls;
      }
      
      if (onEvent) onEvent(eventData);
    }

    // Capture ID and usage if present
    if (parsed.id) {
      responseId = parsed.id;
    }
    if (parsed.usage) {
      usage = parsed.usage;
    }
  }

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

  // Return response object (compatible with both APIs)
  return {
    text: fullResponse,
    id: responseId,
    usage: usage
  };
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
