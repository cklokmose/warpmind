/**
 * Base HTTP client with retry logic and error handling
 * Provides the foundation for all API interactions
 */

// Import utility functions for retry logic and timeouts
const { 
  createTimeoutController, 
  shouldRetry, 
  calculateRetryDelay, 
  sleep 
} = require('../util.js');

/**
 * Custom error class for timeout errors
 */
class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Base client class that handles HTTP requests, retries, and configuration
 */
class BaseClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || 'https://api.openai.com';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gpt-5-mini';
    this.temperature = config.temperature || 1.0;
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30000;
  }

  /**
   * Set the API key for authentication with the proxy server
   * @param {string} apiKey - The custom proxy authentication key (not an OpenAI key)
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Set the base URL for the proxy server
   * @param {string} baseURL - The base URL for the school proxy server or OpenAI-compatible API
   */
  setBaseURL(baseURL) {
    this.baseURL = baseURL;
  }

  /**
   * Set the model to use for completions
   * @param {string} model - The model name (e.g., 'gpt-3.5-turbo', 'gpt-4')
   */
  setModel(model) {
    this.model = model;
  }

  /**
   * Configure generation parameters
   * @param {Object} params - Parameters object
   * @param {number} params.temperature - Temperature for randomness (0-2)
   * @param {string} params.model - Model name
   * @param {string} params.apiKey - API key
   * @param {string} params.baseURL - Base URL
   */
  configure(params = {}) {
    if (params.temperature !== undefined) this.temperature = params.temperature;
    if (params.model !== undefined) this.model = params.model;
    if (params.apiKey !== undefined) this.apiKey = params.apiKey;
    if (params.baseURL !== undefined) this.baseURL = params.baseURL;
  }

  /**
   * Construct a proper API URL by combining baseURL and endpoint
   * Handles both cases: baseURL with and without /v1 suffix
   * @param {string} endpoint - API endpoint (e.g., '/chat/completions')
   * @returns {string} - Complete API URL
   */
  _buildApiUrl(endpoint) {
    let baseUrl = this.baseURL;
    
    // Remove trailing slash from baseURL if present
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    // If baseURL doesn't end with /v1, add it
    if (!baseUrl.endsWith('/v1')) {
      baseUrl += '/v1';
    }
    
    // Ensure endpoint starts with /
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }
    
    return baseUrl + endpoint;
  }

  /**
   * Make a request to the OpenAI-compatible API with proper headers, retry logic, and timeout
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @param {number} options.maxRetries - Maximum number of retry attempts (default: 5)
   * @returns {Promise} - API response
   */
  async makeRequest(endpoint, data, options = {}) {
    if (!this.apiKey) {
      throw new Error('API key is required. Use setApiKey() to set your proxy authentication key.');
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 5;
    const url = this._buildApiUrl(endpoint);
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { controller, timeoutId } = createTimeoutController(timeoutMs);
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey // Custom header for proxy authentication
          },
          body: JSON.stringify(data),
          signal: controller ? controller.signal : undefined
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Check if we should retry this status code
          if (shouldRetry(response.status) && attempt < maxRetries) {
            const retryAfter = response.headers.get ? response.headers.get('Retry-After') : null;
            const delay = calculateRetryDelay(attempt, retryAfter);
            
            console.warn(`Request failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await sleep(delay);
            continue;
          }

          const errorData = await response.json().catch(() => ({}));
          throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        
        // Handle timeout errors
        if (error.name === 'AbortError') {
          throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
        }
        
        // Handle network errors - retry if not last attempt
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          if (attempt < maxRetries) {
            const delay = calculateRetryDelay(attempt);
            console.warn(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await sleep(delay);
            continue;
          }
          throw new Error('Network error: Unable to connect to the API. Please check your internet connection.');
        }
        
        // For other errors, don't retry
        throw error;
      }
    }
  }
}

// Export both the BaseClient class and TimeoutError
module.exports = { BaseClient, TimeoutError };
