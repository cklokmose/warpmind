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
    this.model = config.model || 'gpt-4o';
    this.temperature = config.temperature || 0.7;
    this.defaultTimeoutMs = config.defaultTimeoutMs || 60000;
    this.customHeaders = config.customHeaders || {}; // Support for custom headers
    this.authType = config.authType || 'default';
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
   * Set custom headers for all requests (e.g., session keys)
   * @param {Object} headers - Custom headers object
   */
  setCustomHeaders(headers) {
    this.customHeaders = headers || {};
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
   * @param {string} params.authType - Auth type ('default' or 'bearer')
   */
  configure(params = {}) {
    if (params.temperature !== undefined) this.temperature = params.temperature;
    if (params.model !== undefined) this.model = params.model;
    if (params.apiKey !== undefined) this.apiKey = params.apiKey;
    if (params.baseURL !== undefined) this.baseURL = params.baseURL;
    if (params.authType !== undefined) this.authType = params.authType;
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
   * Build API URL with query parameters
   * @param {string} endpoint - API endpoint
   * @param {Object} queryParams - Query parameters object
   * @returns {string} - Complete API URL with query string
   */
  _buildApiUrlWithQuery(endpoint, queryParams) {
    const url = this._buildApiUrl(endpoint);
    if (!queryParams || Object.keys(queryParams).length === 0) {
      return url;
    }
    const params = new URLSearchParams(queryParams);
    return `${url}?${params.toString()}`;
  }

  /**
   * Make a request to the OpenAI-compatible API with proper headers, retry logic, and timeout
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data (ignored for GET/DELETE requests)
   * @param {Object} options - Request options
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @param {number} options.maxRetries - Maximum number of retry attempts (default: 5)
   * @param {string} options.method - HTTP method (default: 'POST')
   * @param {Object} options.queryParams - Query parameters for GET requests
   * @returns {Promise} - API response
   */
  async makeRequest(endpoint, data, options = {}) {
    if (!this.apiKey) {
      throw new Error('API key is required. Use setApiKey() to set your proxy authentication key.');
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 5;
    const method = options.method || 'POST';
    const queryParams = options.queryParams || {};
    const url = Object.keys(queryParams).length > 0
      ? this._buildApiUrlWithQuery(endpoint, queryParams)
      : this._buildApiUrl(endpoint);
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { controller, timeoutId } = createTimeoutController(timeoutMs);
      
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...this.customHeaders
        };

        if (this.authType === 'bearer') {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        } else {
          headers['api-key'] = this.apiKey; // Custom header for proxy authentication
        }

        const fetchOptions = {
          method: method,
          headers: headers,
          signal: controller ? controller.signal : undefined
        };

        // Only include body for POST/PUT/PATCH requests
        if (data && method !== 'GET' && method !== 'DELETE') {
          fetchOptions.body = JSON.stringify(data);
        }

        const response = await fetch(url, fetchOptions);

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
