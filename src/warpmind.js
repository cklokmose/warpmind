/**
 * Warpmind - A simple library for easy use of OpenAI-compatible APIs for students
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
  } catch (error) {
    throw new Error('Utility functions are required. Please ensure util.js is bundled with your application.');
  }
}

class Warpmind extends BaseClient {
  constructor(config = {}) {
    super(config); // Call BaseClient constructor
    
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

    const requestData = {
      model: options.model || this.model,
      messages: messages,
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

    const response = await this.makeRequest('/chat/completions', requestData, requestOptions);
    return response.choices[0]?.message?.content || '';
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

    const requestData = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature,
      stream: true
    };

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
    
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
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
      const finalResponse = await this.parseSSE(reader, (event) => {
        // Accumulate content internally
        fullResponse += event.delta;
        
        // Emit chunk in the new enhanced format immediately to callback
        if (onChunk) {
          onChunk({
            type: "chunk",
            content: event.delta
          });
        }
      });

      // Clear timeout only after streaming completes
      clearTimeout(timeoutId);
      
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
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Warpmind;
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
  window.Warpmind = Warpmind;
  window.TimeoutError = TimeoutError;
  // Also expose utilities for testing in browser
  window.WarpmindUtils = {
    addJitter,
    calculateRetryDelay,
    shouldRetry,
    createTimeoutController,
    sleep,
    delayForRetry
  };
}

// Also attach TimeoutError to Warpmind class for webpack UMD compatibility
Warpmind.TimeoutError = TimeoutError;