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
    
    // Import PDF loader module in browser
    createPdfLoaderModule = require('./modules/pdf-loader.js');
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
        try {
          const result = await this._executeTool(toolCall);
          
          // Add tool result to messages
          newMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
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
      return await this._chatWithTools(newMessages, options, depth + 1);
    }

    // No tool calls or max depth reached, return the content
    return message.content || '';
  }

  /**
   * Generate a simple completion
   * @param {string} prompt - The prompt text
   * @param {Object} options - Optional parameters
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<string>} - The generated response
   */
  async complete(prompt, options = {}) {
    const requestData = {
      model: options.model || 'gpt-3.5-turbo-instruct',
      prompt: prompt,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature
    };

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.model;
    delete filteredOptions.temperature;
    delete filteredOptions.timeoutMs;
    
    Object.assign(requestData, filteredOptions);

    const requestOptions = {
      timeoutMs: options.timeoutMs
    };

    const response = await this.makeRequest('/completions', requestData, requestOptions);
    return response.choices[0]?.text || '';
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
        if (event.delta !== undefined) { // Check for undefined instead of truthy to allow empty strings
          fullResponse += event.delta;
          currentMessage.content += event.delta;
          
          // Emit chunk in the new enhanced format immediately to callback
          if (onChunk) {
            onChunk({
              type: "chunk",
              content: event.delta
            });
          }
        }
        
        // Check for tool calls in the event
        if (event.tool_calls) {
          hasToolCalls = true;
          if (!currentMessage.tool_calls) {
            currentMessage.tool_calls = [];
          }
          currentMessage.tool_calls.push(...event.tool_calls);
        }
      });

      // Clear timeout only after streaming completes
      clearTimeout(timeoutId);
      
      // Check if we need to handle tool calls
      if (hasToolCalls && currentMessage.tool_calls && currentMessage.tool_calls.length > 0 && depth < MAX_TOOL_CALL_DEPTH) {
        // Add the assistant's message to the conversation
        const newMessages = [...messages, currentMessage];

        // Execute each tool call
        for (const toolCall of currentMessage.tool_calls) {
          try {
            const result = await this._executeTool(toolCall);
            
            // Add tool result to messages
            newMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
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

        // Recursively call streamChat to let the model respond to tool results
        const toolResponse = await this._streamChatWithTools(newMessages, onChunk, options, depth + 1);
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
   * Execute a tool call
   * @private
   * @param {Object} toolCall - Tool call from OpenAI response
   * @returns {Promise<any>} - Result from tool execution
   */
  async _executeTool(toolCall) {
    const tool = this._tools.find(t => t.schema.function.name === toolCall.function.name);
    
    if (!tool) {
      throw new Error(`Tool '${toolCall.function.name}' not found`);
    }
    
    try {
      // Parse the arguments from JSON
      const args = JSON.parse(toolCall.function.arguments);
      
      // Execute the tool handler
      const result = await tool.handler(args);
      
      return result;
    } catch (error) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for text using OpenAI's embedding models
   * @param {string} text - Text to generate embeddings for
   * @param {Object} options - Optional parameters
   * @param {string} options.model - Embedding model to use (default: 'text-embedding-3-small')
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<number[]>} - The embedding vector
   */
  async embed(text, options = {}) {
    const { model = 'text-embedding-3-small', timeoutMs = this.timeoutMs } = options;
    
    const requestBody = {
      model: model,
      input: text
    };

    const response = await this.makeRequest('/embeddings', requestBody, { timeoutMs });

    if (response.data && response.data.length > 0) {
      return response.data[0].embedding;
    }
    
    throw new Error('Failed to generate embedding: No embedding data returned');
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