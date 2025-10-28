/**
 * WarpMind - A simple library for easy use of OpenAI-compatible APIs for students
 * Designed to work with school proxy servers using custom authentication keys
 */

// Import utility functions for better modularity
let addJitter, calculateRetryDelay, shouldRetry, createTimeoutController, sleep, delayForRetry, fileToBase64;

// Import base client and TimeoutError
const { BaseClient, TimeoutError } = require('./core/base-client.js');

// Import SSE parser for streaming functionality
const { parseSSE, createParser } = require('./streaming/sse-parser.js');

// Import audio module factory
let createAudioModule;

// Import vision module factory  
let createVisionModule;

// Import data processing module factory
let createDataProcessingModule;

// Import PDF loader module factory
let createPdfLoaderModule;

// Import memory module factory
let createMemoryModule;

// Import tool call tracker
let ToolCallTracker;

if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  const utils = require('./util.js');
  ({ 
    addJitter, 
    calculateRetryDelay, 
    shouldRetry, 
    createTimeoutController, 
    sleep, 
    delayForRetry,
    fileToBase64
  } = utils);
  
  // Import audio module in Node.js
  createAudioModule = require('./modules/audio.js');
  
  // Import vision module in Node.js
  createVisionModule = require('./modules/vision.js');
  
  // Import data processing module in Node.js
  createDataProcessingModule = require('./modules/data-processing.js');
  
  // Import memory module in Node.js
  createMemoryModule = require('./modules/memory.js');
  
  // Import tool call tracker in Node.js
  ToolCallTracker = require('./modules/tool-call-tracker.js');
  
  // Import PDF loader module in Node.js
  createPdfLoaderModule = require('./modules/pdf-loader.js');
} else {
  // Browser environment - webpack should bundle util.js
  try {
    const utils = require('./util.js');
    ({ 
      addJitter, 
      calculateRetryDelay, 
      shouldRetry, 
      createTimeoutController, 
      sleep, 
      delayForRetry,
      fileToBase64
    } = utils);
    
    // Import audio module in browser
    createAudioModule = require('./modules/audio.js');
    
    // Import vision module in browser
    createVisionModule = require('./modules/vision.js');
    
    // Import data processing module in browser
    createDataProcessingModule = require('./modules/data-processing.js');
    
    // Import memory module in browser
    createMemoryModule = require('./modules/memory.js');
    
    // Import PDF loader module in browser
    createPdfLoaderModule = require('./modules/pdf-loader.js');
    
    // Import tool call tracker in browser
    ToolCallTracker = require('./modules/tool-call-tracker.js');
  } catch (error) {
    throw new Error('Utility functions are required. Please ensure util.js is bundled with your application.');
  }
}

class WarpMind extends BaseClient {
  constructor(config = {}) {
    // Handle API key auto-prompting in browser environment
    if (!config.apiKey && typeof window !== 'undefined') {
      // Check localStorage first
      const savedApiKey = localStorage.getItem('warpmind-api-key');
      if (savedApiKey) {
        config.apiKey = savedApiKey;
      } else {
        // Prompt user for API key
        const apiKey = prompt('WarpMind API Key Required\n\nPlease enter your API key to continue:');
        if (apiKey && apiKey.trim()) {
          config.apiKey = apiKey.trim();
          // Save to localStorage for future use
          localStorage.setItem('warpmind-api-key', config.apiKey);
        } else {
          throw new Error('API key is required to use WarpMind');
        }
      }
    }
    
    super(config); // Call BaseClient constructor
    
    // Initialize tool registry
    this._tools = [];
    
    // Initialize tool call tracker
    this._toolCallTracker = new ToolCallTracker();
    
    // Memory tool configuration
    this._memoryToolConfig = {
      enabled: config.memoryToolEnabled !== false, // Default to true if memory module is present
      explicitOnly: config.memoryToolExplicitOnly !== false, // Default to true
      maxResults: config.memoryToolMaxResults || 5
    };
    
    // Bind the parseSSE function to this instance for backward compatibility
    this.parseSSE = parseSSE.bind(this);
    
    // Integrate audio module methods
    const audioMethods = createAudioModule(this);
    Object.assign(this, audioMethods);
    
    // Integrate vision module methods
    const visionMethods = createVisionModule(this);
    Object.assign(this, visionMethods);
    
    // Integrate data processing module methods
    const dataProcessingMethods = createDataProcessingModule(this);
    Object.assign(this, dataProcessingMethods);
    
    // Integrate PDF loader module methods
    const pdfLoaderMethods = createPdfLoaderModule(this);
    Object.assign(this, pdfLoaderMethods);
    
    // Integrate memory module methods
    const memoryMethods = createMemoryModule(this);
    Object.assign(this, memoryMethods);
  }

  /**
   * Update the API key and save it to localStorage (browser only)
   * @param {string} apiKey - The new API key
   */
  setApiKey(apiKey) {
    super.setApiKey(apiKey); // Call parent method
    if (typeof window !== 'undefined') {
      localStorage.setItem('warpmind-api-key', apiKey);
    }
  }

  /**
   * Clear the saved API key from localStorage (browser only)
   * @static
   */
  static clearSavedApiKey() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('warpmind-api-key');
    }
  }

  /**
   * Get the saved API key from localStorage (browser only)
   * @static
   * @returns {string|null} - The saved API key or null if not found
   */
  static getSavedApiKey() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('warpmind-api-key');
    }
    return null;
  }

  /**
   * Prompt user for a new API key and save it (browser only)
   * @static
   * @returns {string|null} - The new API key or null if cancelled
   */
  static promptForApiKey() {
    if (typeof window !== 'undefined') {
      const apiKey = prompt('WarpMind API Key Required\n\nPlease enter your API key:');
      if (apiKey && apiKey.trim()) {
        const trimmedKey = apiKey.trim();
        localStorage.setItem('warpmind-api-key', trimmedKey);
        return trimmedKey;
      }
    }
    return null;
  }

  /**
   * Generate a chat completion
   * @param {string|Array} messages - Single message string or array of message objects
   * @param {Object} options - Optional parameters
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<string>} - The generated response
   */
  async chat(messages, options = {}) {
    // Convert string message to proper format
    if (typeof messages === 'string') {
      messages = [{ role: 'user', content: messages }];
    }

    // Support tool calling with depth limit
    return await this._chatWithTools(messages, options, 0);
  }

  /**
   * Internal chat method that handles tool calling with depth limit
   * @private
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Chat options
   * @param {number} depth - Current recursion depth
   * @returns {Promise<string>} - The final response
   */
  async _chatWithTools(messages, options = {}, depth = 0) {
    const MAX_TOOL_CALL_DEPTH = 2;
    
    // Track tool calls for metadata if requested
    const toolCallsMetadata = [];
    const startTime = performance.now();
    
    const requestData = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature
    };

    // Include tools if registered and not at max depth
    if (this._tools.length > 0 && depth < MAX_TOOL_CALL_DEPTH) {
      requestData.tools = this._tools.map(t => t.schema);
      requestData.tool_choice = 'auto'; // Let the model decide when to use tools
    }

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.model;
    delete filteredOptions.temperature;
    delete filteredOptions.timeoutMs;
    delete filteredOptions.onToolCall;
    delete filteredOptions.onToolResult;
    delete filteredOptions.onToolError;
    delete filteredOptions.returnMetadata;
    
    Object.assign(requestData, filteredOptions);

    const requestOptions = {
      timeoutMs: options.timeoutMs
    };

    const response = await this.makeRequest('/chat/completions', requestData, requestOptions);
    const message = response.choices[0]?.message;
    
    if (!message) {
      throw new Error('No message in response');
    }

    // Check if the assistant wants to call tools
    if (message.tool_calls && message.tool_calls.length > 0 && depth < MAX_TOOL_CALL_DEPTH) {
      // Add the assistant's message to the conversation
      const newMessages = [...messages, {
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls
      }];

      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        let toolCallMetadata = null;
        
        try {
          const result = await this._executeTool(toolCall, {
            onToolCall: (callData) => {
              // Store metadata for returnMetadata option
              if (options.returnMetadata) {
                toolCallMetadata = {
                  id: callData.callId,
                  name: callData.name,
                  parameters: callData.parameters,
                  timestamp: callData.timestamp
                };
              }
              // Call user callback
              if (options.onToolCall) {
                options.onToolCall(callData);
              }
            },
            onToolResult: (resultData) => {
              // Update metadata for returnMetadata option
              if (options.returnMetadata && toolCallMetadata) {
                toolCallMetadata.result = resultData.result;
                toolCallMetadata.duration = resultData.duration;
                toolCallMetadata.success = true;
                toolCallsMetadata.push(toolCallMetadata);
              }
              // Call user callback
              if (options.onToolResult) {
                options.onToolResult(resultData);
              }
            },
            onToolError: (errorData) => {
              // Update metadata for returnMetadata option
              if (options.returnMetadata && toolCallMetadata) {
                toolCallMetadata.error = errorData.error;
                toolCallMetadata.duration = errorData.duration;
                toolCallMetadata.success = false;
                toolCallsMetadata.push(toolCallMetadata);
              }
              // Call user callback
              if (options.onToolError) {
                options.onToolError(errorData);
              }
            }
          });
          
          // Add tool result to messages
          newMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result ?? null)
          });
        } catch (error) {
          // Add error result to messages
          newMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message })
          });
        }
      }

      // Recursively call chat to let the model respond to tool results
      const recursiveResult = await this._chatWithTools(newMessages, options, depth + 1);
      
      // If returnMetadata is requested and this is the top-level call, wrap the result
      if (options.returnMetadata && depth === 0) {
        const totalDuration = Math.round(performance.now() - startTime);
        return {
          response: recursiveResult,
          metadata: {
            toolCalls: toolCallsMetadata,
            totalDuration,
            tokensUsed: response.usage?.total_tokens || null
          }
        };
      }
      
      return recursiveResult;
    }

    // No tool calls or max depth reached, return the content
    const finalResponse = message.content || '';
    
    // If returnMetadata is requested and this is the top-level call, wrap the result
    if (options.returnMetadata && depth === 0) {
      const totalDuration = Math.round(performance.now() - startTime);
      return {
        response: finalResponse,
        metadata: {
          toolCalls: toolCallsMetadata,
          totalDuration,
          tokensUsed: response.usage?.total_tokens || null
        }
      };
    }
    
    return finalResponse;
  }

  /**
   * Generate a simple completion
   * @param {string} prompt - The prompt text
   * @param {Object} options - Optional parameters
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<string>} - The generated response
   */
  async complete(prompt, options = {}) {
    // Convert prompt to chat format with system prompt for completion behavior
    const messages = [
      { role: 'system', content: 'Complete the text directly and concisely without explanation or additional commentary.' },
      { role: 'user', content: prompt }
    ];
    
    const requestData = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.1,
      max_tokens: options.max_tokens !== undefined ? options.max_tokens : 50
    };

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.model;
    delete filteredOptions.temperature;
    delete filteredOptions.timeoutMs;
    delete filteredOptions.max_tokens;
    
    Object.assign(requestData, filteredOptions);

    const requestOptions = {
      timeoutMs: options.timeoutMs
    };

    const response = await this.makeRequest('/chat/completions', requestData, requestOptions);
    return response.choices[0]?.message?.content || '';
  }

  /**
   * Ask a simple question and get a response
   * @param {string} question - The question to ask
   * @param {Object} options - Optional parameters
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<string>} - The AI response
   */
  async ask(question, options = {}) {
    return await this.chat(question, options);
  }

  /**
   * Stream chat completion (for real-time responses)
   * @param {string|Array} messages - Single message string or array of message objects
   * @param {Function} onChunk - Callback function for each chunk - receives { type: "chunk", content: string }
   * @param {Object} options - Optional parameters
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<string>} - The complete generated response
   */
  async streamChat(messages, onChunk, options = {}) {
    if (typeof messages === 'string') {
      messages = [{ role: 'user', content: messages }];
    }

    // Support tool calling with depth limit
    return await this._streamChatWithTools(messages, onChunk, options, 0);
  }

  /**
   * Internal streaming chat method that handles tool calling with depth limit
   * @private
   * @param {Array} messages - Array of message objects
   * @param {Function} onChunk - Callback function for each chunk
   * @param {Object} options - Chat options
   * @param {number} depth - Current recursion depth
   * @returns {Promise<string>} - The final response
   */
  async _streamChatWithTools(messages, onChunk, options = {}, depth = 0) {
    const MAX_TOOL_CALL_DEPTH = 2;
    
    const requestData = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature,
      stream: true
    };

    // Include tools if registered and not at max depth
    if (this._tools.length > 0 && depth < MAX_TOOL_CALL_DEPTH) {
      requestData.tools = this._tools.map(t => t.schema);
      requestData.tool_choice = 'auto'; // Let the model decide when to use tools
    }

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.model;
    delete filteredOptions.temperature;
    delete filteredOptions.stream;
    delete filteredOptions.timeoutMs;
    delete filteredOptions.onToolCall;
    delete filteredOptions.onToolResult;
    delete filteredOptions.onToolError;
    
    Object.assign(requestData, filteredOptions);

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const { controller, timeoutId } = createTimeoutController(timeoutMs);
    
    // Internal accumulator for full response
    let fullResponse = '';
    let currentMessage = { role: 'assistant', content: '', tool_calls: [] };
    let hasToolCalls = false;
    
    try {
      const response = await fetch(this._buildApiUrl('/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(requestData),
        signal: controller.signal
      });

      // Don't clear timeout yet - we need it for the streaming phase too

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
      }

      const reader = response.body.getReader();
      
      // Use the new SSE parser with enhanced event callback
      await this.parseSSE(reader, (event) => {
        // Handle different types of streaming events
        if (event.delta !== undefined && event.delta !== null) { // Check for both undefined and null
          const deltaContent = event.delta || ''; // Ensure it's a string
          fullResponse += deltaContent;
          currentMessage.content += deltaContent;
          
          // Emit chunk in the new enhanced format immediately to callback
          if (onChunk) {
            onChunk({
              type: "chunk",
              content: deltaContent
            });
          }
        }
        
        // Handle tool calls delta - merge into existing tool calls
        if (event.tool_calls) {
          hasToolCalls = true;
          if (!currentMessage.tool_calls) {
            currentMessage.tool_calls = [];
          }
          
          // Merge tool call deltas properly
          for (const delta of event.tool_calls) {
            const index = delta.index !== undefined ? delta.index : 0; // Default to 0 if no index
            
            // Initialize tool call at this index if it doesn't exist
            if (!currentMessage.tool_calls[index]) {
              currentMessage.tool_calls[index] = {
                id: '',
                type: 'function',
                function: {
                  name: '',
                  arguments: ''
                }
              };
            }
            
            const toolCall = currentMessage.tool_calls[index];
            
            // Merge the delta
            if (delta.id) {
              toolCall.id = delta.id;
            }
            if (delta.type) {
              toolCall.type = delta.type;
            }
            if (delta.function) {
              if (delta.function.name) {
                toolCall.function.name += delta.function.name;
              }
              if (delta.function.arguments) {
                toolCall.function.arguments += delta.function.arguments;
              }
            }
          }
        }
      });

      // Clear timeout only after streaming completes
      clearTimeout(timeoutId);
      
      // Check if we need to handle tool calls
      if (hasToolCalls && currentMessage.tool_calls && currentMessage.tool_calls.length > 0 && depth < MAX_TOOL_CALL_DEPTH) {
        // Filter out incomplete tool calls and validate
        const validToolCalls = currentMessage.tool_calls.filter(toolCall => {
          return toolCall && 
                 toolCall.id && 
                 toolCall.function && 
                 toolCall.function.name &&
                 toolCall.function.arguments !== undefined;
        });
        
        if (validToolCalls.length === 0) {
          // No valid tool calls, return current response
          return fullResponse;
        }
        
        // Update the message with only valid tool calls
        currentMessage.tool_calls = validToolCalls;
        // Note: Messages with tool_calls should not be shown in UI
        
        // Add the assistant's message to the conversation
        const newMessages = [...messages, currentMessage];

        // Execute each valid tool call
        for (const toolCall of validToolCalls) {
          try {
            const result = await this._executeTool(toolCall, {
              onToolCall: options.onToolCall,
              onToolResult: options.onToolResult,
              onToolError: options.onToolError
            });
            
            // Add tool result to messages (these should not be shown in UI)
            newMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result ?? null)
            });
          } catch (error) {
            // Add error result to messages (these should not be shown in UI)
            newMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: error.message })
            });
          }
        }

        // Make a final call with tool_choice: "none" to get the user-facing response
        const finalOptions = {
          ...options,
          tool_choice: 'none' // Force final response without more tool calls
        };
        
        // Remove tools from final options to ensure no more tool calls
        delete finalOptions.tools;
        
        // Recursively call to get final response
        const toolResponse = await this._streamChatWithTools(newMessages, onChunk, finalOptions, depth + 1);
        return fullResponse + toolResponse;
      }
      
      // Return the accumulated full response
      return fullResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Register a tool that the AI can call during conversations
   * @param {Object} tool - Tool definition
   * @param {string} tool.name - Tool name (must be unique)
   * @param {string} tool.description - Description of what the tool does
   * @param {Object} tool.parameters - JSON schema for tool parameters
   * @param {Function} tool.handler - Async function to execute when tool is called
   */
  registerTool(tool) {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }
    
    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool description must be a non-empty string');
    }
    
    if (!tool.parameters || typeof tool.parameters !== 'object') {
      throw new Error('Tool parameters must be an object (JSON schema)');
    }
    
    if (!tool.handler || typeof tool.handler !== 'function') {
      throw new Error('Tool handler must be a function');
    }
    
    // Check for duplicate tool names
    if (this._tools.find(t => t.schema.function.name === tool.name)) {
      throw new Error(`Tool with name '${tool.name}' is already registered`);
    }
    
    // Create the tool schema for OpenAI API
    const schema = {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    };
    
    // Store both schema and handler
    this._tools.push({ schema, handler: tool.handler });
  }

  /**
   * Unregister a tool by name
   * @param {string} toolName - Name of the tool to unregister
   * @returns {boolean} - True if tool was found and removed, false otherwise
   */
  unregisterTool(toolName) {
    if (!toolName || typeof toolName !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }

    const toolIndex = this._tools.findIndex(t => t.schema.function.name === toolName);
    if (toolIndex !== -1) {
      this._tools.splice(toolIndex, 1);
      return true;
    }
    return false;
  }

  /**
   * Check if a tool is registered
   * @param {string} toolName - Name of the tool to check
   * @returns {boolean} - True if tool is registered, false otherwise
   */
  isToolRegistered(toolName) {
    if (!toolName || typeof toolName !== 'string') {
      return false;
    }
    return this._tools.some(t => t.schema.function.name === toolName);
  }

  /**
   * Get array of all registered tool names
   * @returns {Array<string>} - Array of tool names
   */
  getRegisteredTools() {
    return this._tools.map(t => t.schema.function.name);
  }

  /**
   * Clear all registered tools
   */
  clearAllTools() {
    this._tools = [];
  }

  /**
   * Execute a tool call
   * @private
   * @param {Object} toolCall - Tool call from OpenAI response
   * @returns {Promise<any>} - Result from tool execution
   */
  async _executeTool(toolCall, callbacks = {}) {
    const tool = this._tools.find(t => t.schema.function.name === toolCall.function.name);
    
    if (!tool) {
      throw new Error(`Tool '${toolCall.function.name}' not found`);
    }
    
    let trackedCall = null;
    
    try {
      // Parse the arguments from JSON
      const args = JSON.parse(toolCall.function.arguments);
      
      // Start tracking the tool call
      trackedCall = this._toolCallTracker.startCall(toolCall.function.name, args);
      
      // Call onToolCall callback if provided
      this._safeCallCallback(callbacks.onToolCall, {
        callId: trackedCall.callId,
        name: trackedCall.name,
        parameters: trackedCall.parameters,
        timestamp: trackedCall.timestamp
      });
      
      // Execute the tool handler
      const result = await tool.handler(args);
      
      // Complete the tracked call
      const completedCall = this._toolCallTracker.completeCall(trackedCall.callId, result);
      
      // Call onToolResult callback if provided
      this._safeCallCallback(callbacks.onToolResult, {
        callId: completedCall.callId,
        name: completedCall.name,
        result: completedCall.result,
        duration: completedCall.duration,
        timestamp: new Date().toISOString()
      });
      
      return result;
    } catch (error) {
      // Mark call as failed if it was started
      if (trackedCall) {
        const errorCall = this._toolCallTracker.errorCall(trackedCall.callId, error);
        
        // Call onToolError callback if provided
        this._safeCallCallback(callbacks.onToolError, {
          callId: errorCall.callId,
          name: errorCall.name,
          error: errorCall.error,
          duration: errorCall.duration,
          timestamp: new Date().toISOString()
        });
      }
      
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  /**
   * Safely execute a callback function, catching any errors to prevent disruption
   * @private
   * @param {Function} callback - The callback function to execute
   * @param {*} data - Data to pass to the callback
   */
  _safeCallCallback(callback, data) {
    if (typeof callback === 'function') {
      try {
        callback(data);
      } catch (error) {
        console.warn('Error in tool call callback:', error);
      }
    }
  }

  /**
   * Generate embeddings for text using the embeddings API
   * @param {string} text - The text to generate embeddings for
   * @param {Object} options - Optional parameters
   * @param {string} options.model - The embedding model to use (default: 'text-embedding-3-small')
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<number[]>} - The embedding vector as an array of numbers
   */
  async embed(text, options = {}) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text input is required and must be a string');
    }

    const requestData = {
      model: options.model || 'text-embedding-3-small',
      input: text
    };

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.model;
    delete filteredOptions.timeoutMs;
    
    Object.assign(requestData, filteredOptions);

    const requestOptions = {
      timeoutMs: options.timeoutMs
    };

    try {
      const response = await this.makeRequest('/embeddings', requestData, requestOptions);
      
      if (!response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid embedding response format');
      }

      return response.data[0].embedding;
    } catch (error) {
      // Re-throw with more context if it's an API error
      if (error.message.includes('API request failed')) {
        throw new Error(`Embedding generation failed: ${error.message}`);
      }
      throw error;
    }
  }

  // ========================================
  // Responses API Methods (NEW)
  // ========================================

  /**
   * Send a message using the Responses API (non-streaming)
   * @param {string|Array} input - User input (string or array)
   * @param {Object} options - Request options
   * @param {string} options.instructions - System instructions
   * @param {string} options.model - Model to use
   * @param {string} options.previous_response_id - Previous response ID for conversation chaining
   * @param {boolean} options.store - Whether to store the response (default: true)
   * @param {Object} options.metadata - Custom metadata
   * @returns {Promise<Object>} - Response object with {text, id, usage}
   */
  async respond(input, options = {}) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.respond(this, input, options);
  }

  /**
   * Send a streaming message using the Responses API
   * @param {string|Array} input - User input
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Final response object
   */
  async streamRespond(input, onChunk, options = {}) {
    const { ResponseClient } = require('./core/response-client.js');
    return await ResponseClient.streamRespond(this, input, onChunk, options);
  }

  /**
   * Create a conversation instance for multi-turn interactions
   * @param {Object} options - Conversation options
   * @param {string} options.instructions - System instructions for the conversation
   * @param {string} options.model - Model to use
   * @returns {Conversation} - Conversation instance
   */
  createConversation(options = {}) {
    const { Conversation } = require('./conversations/conversation.js');
    return new Conversation(this, options);
  }

  /**
   * Get a response by ID
   * @param {string} responseId - Response ID
   * @param {Object} options - Query options
   * @param {Array<string>} options.include - Additional data to include
   * @returns {Promise<Object>} - Response object
   */
  async getResponse(responseId, options = {}) {
    return await this.makeRequest(`/responses/${responseId}`, null, {
      method: 'GET',
      queryParams: options
    });
  }

  /**
   * Delete a response by ID
   * @param {string} responseId - Response ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  async deleteResponse(responseId) {
    return await this.makeRequest(`/responses/${responseId}`, null, {
      method: 'DELETE'
    });
  }

  /**
   * Cancel a response by ID
   * @param {string} responseId - Response ID
   * @returns {Promise<Object>} - Cancellation confirmation
   */
  async cancelResponse(responseId) {
    return await this.makeRequest(`/responses/${responseId}/cancel`, null, {
      method: 'POST'
    });
  }

  /**
   * Send a background response and return immediately
   * @param {string|Array} input - User input
   * @param {Object} options - Request options
   * @returns {Promise<string>} - Response ID for polling
   */
  async respondBackground(input, options = {}) {
    const response = await this.respond(input, { ...options, store: true });
    return response.id;
  }

  /**
   * Poll a response until it's completed
   * @param {string} responseId - Response ID to poll
   * @param {Object} options - Polling options
   * @param {number} options.maxWaitMs - Maximum wait time in milliseconds (default: 300000 = 5 minutes)
   * @param {number} options.initialDelayMs - Initial delay before first check (default: 1000ms)
   * @returns {Promise<Object>} - Completed response
   */
  async pollUntilComplete(responseId, options = {}) {
    const maxWaitMs = options.maxWaitMs || 300000; // 5 minutes default
    const initialDelayMs = options.initialDelayMs || 1000;
    const startTime = Date.now();
    let delay = initialDelayMs;

    while (Date.now() - startTime < maxWaitMs) {
      // Wait before checking
      await new Promise(resolve => setTimeout(resolve, delay));

      // Get response status
      const response = await this.getResponse(responseId);

      // Check status
      if (response.status === 'completed') {
        return response;
      }

      if (response.status === 'failed') {
        throw new Error(`Response failed: ${response.error?.message || 'Unknown error'}`);
      }

      if (response.status === 'cancelled') {
        throw new Error('Response was cancelled');
      }

      // Exponential backoff: 1s → 2s → 4s → 8s → max 10s
      delay = Math.min(delay * 2, 10000);
    }

    throw new Error(`Polling timeout: Response not completed after ${maxWaitMs}ms`);
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WarpMind;
  module.exports.TimeoutError = TimeoutError;
  // Also export utility functions for testing purposes
  module.exports.utils = {
    addJitter,
    calculateRetryDelay,
    shouldRetry,
    createTimeoutController,
    sleep,
    delayForRetry
  };
} else if (typeof window !== 'undefined') {
  window.WarpMind = WarpMind;
  window.TimeoutError = TimeoutError;
  // Also expose utilities for testing in browser
  window.WarpMindUtils = {
    addJitter,
    calculateRetryDelay,
    shouldRetry,
    createTimeoutController,
    sleep,
    delayForRetry
  };
}

// Also attach TimeoutError to WarpMind class for webpack UMD compatibility
WarpMind.TimeoutError = TimeoutError;