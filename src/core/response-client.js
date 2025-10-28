/**
 * Response Client for OpenAI Responses API
 * Handles the new /v1/responses endpoint with static methods
 */

const { sleep } = require('../util.js');

/**
 * Static client for Responses API operations
 */
class ResponseClient {
  /**
   * Convert various input formats to Responses API format
   * @param {string|Array|Object} input - User input
   * @returns {Array} - Converted input array
   */
  static _convertInput(input) {
    // Case 1: String input → simple message item
    if (typeof input === 'string') {
      return [{
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: input }]
      }];
    }

    // Case 2: Already in Responses API format (array of items)
    if (Array.isArray(input) && input.length > 0 && input[0].type) {
      return input;
    }

    // Case 3: Chat Completions format (messages array)
    if (Array.isArray(input) && input.length > 0 && input[0].role) {
      return input.map(msg => {
        // Map developer role to instructions (handled separately)
        if (msg.role === 'developer') {
          return null; // Will be filtered out
        }

        // Convert message format
        const content = typeof msg.content === 'string'
          ? [{ type: 'input_text', text: msg.content }]
          : msg.content; // Already in content array format

        return {
          type: 'message',
          role: msg.role === 'system' ? 'user' : msg.role, // System → user in Responses API
          content: content
        };
      }).filter(item => item !== null);
    }

    // Case 4: Single message object
    if (input.role && input.content) {
      const content = typeof input.content === 'string'
        ? [{ type: 'input_text', text: input.content }]
        : input.content;

      return [{
        type: 'message',
        role: input.role === 'system' ? 'user' : input.role,
        content: content
      }];
    }

    // Fallback: treat as string
    return [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: String(input) }]
    }];
  }

  /**
   * Extract instructions from messages array (developer role)
   * @param {Array} messages - Messages array
   * @returns {string|null} - Extracted instructions
   */
  static _extractInstructions(messages) {
    if (!Array.isArray(messages)) return null;
    
    const developerMsg = messages.find(msg => msg.role === 'developer');
    if (developerMsg) {
      return typeof developerMsg.content === 'string' 
        ? developerMsg.content 
        : developerMsg.content[0]?.text;
    }
    
    return null;
  }

  /**
   * Extract text from response output
   * @param {Array} output - Response output array
   * @returns {string} - Extracted text
   */
  static _extractText(output) {
    if (!output || output.length === 0) {
      return '';
    }

    const textItems = output
      .filter(item => item.type === 'message')
      .flatMap(item => item.content?.filter(c => c.type === 'output_text') || [])
      .map(c => c.text);

    return textItems.length > 0 ? textItems.join('\n') : '';
  }

  /**
   * Check if response has tool calls
   * @param {Array} output - Response output array
   * @returns {boolean}
   */
  static _hasToolCalls(output) {
    if (!output || output.length === 0) return false;

    return output.some(item => 
      item.type === 'function_call' ||
      (item.type === 'message' && item.content?.some(c => c.type === 'function_call'))
    );
  }

  /**
   * Extract tool calls from response
   * @param {Array} output - Response output array
   * @returns {Array} - Tool calls array
   */
  static _extractToolCalls(output) {
    const toolCalls = [];

    for (const item of output) {
      // Handle direct function_call items (Responses API format)
      if (item.type === 'function_call') {
        toolCalls.push({
          id: item.call_id,
          type: 'function',
          function: {
            name: item.name,
            arguments: item.arguments
          }
        });
      }
      
      // Handle nested function_call in message content (alternative format)
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'function_call') {
            toolCalls.push({
              id: content.id,
              name: content.name,
              arguments: content.arguments
            });
          }
        }
      }
    }

    return toolCalls;
  }

  /**
   * Handle tool calls and return results
   * @param {Object} mind - WarpMind instance
   * @param {Array} toolCalls - Tool calls to execute
   * @returns {Promise<Array>} - Tool results
   */
  static async _handleToolCalls(mind, toolCalls) {
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        console.log('Executing tool call:', toolCall);
        const result = await mind._executeTool(toolCall);
        console.log('Tool result:', result);
        
        results.push({
          type: 'function_call_output',
          call_id: toolCall.id,
          output: JSON.stringify(result)
        });
      } catch (error) {
        console.error('Tool execution error:', error);
        results.push({
          type: 'function_call_output',
          call_id: toolCall.id,
          output: JSON.stringify({ error: error.message })
        });
      }
    }

    return results;
  }

  /**
   * Basic respond method (non-streaming)
   * @param {Object} mind - WarpMind instance
   * @param {string|Array} input - User input
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Response object with {text, id, usage}
   */
  static async respond(mind, input, options = {}) {
    // Convert input format
    const convertedInput = this._convertInput(input);

    // Extract instructions from developer role if present
    const extractedInstructions = Array.isArray(input) 
      ? this._extractInstructions(input) 
      : null;

    // Build request payload
    const payload = {
      model: options.model || mind.model,
      input: convertedInput,
      ...options
    };

    // Set instructions (prefer extracted over options)
    if (extractedInstructions) {
      payload.instructions = extractedInstructions;
    } else if (options.instructions) {
      payload.instructions = options.instructions;
    }

    // Add tools if registered (Responses API uses different format than Chat Completions)
    if (mind._tools && mind._tools.length > 0) {
      payload.tools = mind._tools.map(tool => ({
        type: 'function',
        name: tool.schema.function.name,
        description: tool.schema.function.description,
        parameters: tool.schema.function.parameters
      }));
    }

    // Debug: log the payload
    console.log('Responses API payload:', JSON.stringify(payload, null, 2));

    // Make request
    let response = await mind.makeRequest('/responses', payload);

    // Handle tool calls
    while (response.status === 'completed' && this._hasToolCalls(response.output)) {
      const toolCalls = this._extractToolCalls(response.output);
      const toolResults = await this._handleToolCalls(mind, toolCalls);

      // Continue conversation with tool results only
      // Don't include previous response.output - use previous_response_id instead
      const followUpInput = [
        ...convertedInput,
        ...toolResults
      ];

      payload.input = followUpInput;
      if (response.id) {
        payload.previous_response_id = response.id;
      }

      console.log('Follow-up payload with tool results:', JSON.stringify(payload, null, 2));
      response = await mind.makeRequest('/responses', payload);
    }

    // Handle error status
    if (response.status === 'failed') {
      throw new Error(`Response failed: ${response.error?.message || 'Unknown error'}`);
    }

    if (response.status === 'incomplete') {
      console.warn('Incomplete response:', response.incomplete_details);
    }

    // Debug: log the full response
    console.log('Final response object:', JSON.stringify(response, null, 2));
    console.log('Extracted text:', this._extractText(response.output));

    // Return simplified format (matching WarpMind style)
    return {
      text: this._extractText(response.output),
      id: response.id,
      usage: response.usage
    };
  }

  /**
   * Streaming respond method
   * @param {Object} mind - WarpMind instance
   * @param {string|Array} input - User input
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Final response object
   */
  static async streamRespond(mind, input, onChunk, options = {}) {
    // Convert input format
    const convertedInput = this._convertInput(input);

    // Extract instructions
    const extractedInstructions = Array.isArray(input) 
      ? this._extractInstructions(input) 
      : null;

    // Build request payload
    const payload = {
      model: options.model || mind.model,
      input: convertedInput,
      stream: true,
      ...options
    };

    // Set instructions
    if (extractedInstructions) {
      payload.instructions = extractedInstructions;
    } else if (options.instructions) {
      payload.instructions = options.instructions;
    }

    // Add tools (Responses API format)
    if (mind._tools && mind._tools.length > 0) {
      payload.tools = mind._tools.map(tool => ({
        type: 'function',
        name: tool.schema.function.name,
        description: tool.schema.function.description,
        parameters: tool.schema.function.parameters
      }));
    }

    // Make streaming request (similar to streamChat implementation)
    const url = mind._buildApiUrl('/responses');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': mind.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
    }

    const reader = response.body.getReader();
    
    // Use the SSE parser (it now handles Responses API format)
    const { parseSSE } = require('../streaming/sse-parser.js');
    const result = await parseSSE(reader, onChunk);

    return result; // Now returns {text, id, usage}
  }
}

module.exports = { ResponseClient };
