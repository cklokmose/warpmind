/**
 * Utility functions for Warpmind library
 * These are helper functions that support retry logic, timeouts, and other common operations
 */

/**
 * Adds jitter to delay calculation for exponential back-off
 * This prevents the "thundering herd" problem when many clients retry at the same time
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {number} - Delay with added random jitter (0-250ms)
 */
function addJitter(baseDelay) {
  const jitter = Math.random() * 250; // 0-250ms jitter
  return baseDelay + jitter;
}

/**
 * Calculates delay for exponential back-off with optional retry-after header
 * Uses exponential backoff: 500ms × 2^attempt (with jitter)
 * @param {number} attempt - Current attempt number (0-based)
 * @param {string} retryAfter - Optional Retry-After header value in seconds
 * @returns {number} - Delay in milliseconds
 */
function calculateRetryDelay(attempt, retryAfter) {
  if (retryAfter) {
    return parseInt(retryAfter) * 1000; // Convert seconds to milliseconds
  }
  
  const baseDelay = 500 * Math.pow(2, attempt); // 500ms × 2^attempt
  return addJitter(baseDelay);
}

/**
 * Checks if an HTTP status code should trigger a retry
 * Retries on rate limiting and server errors that might be temporary
 * @param {number} status - HTTP status code
 * @returns {boolean} - Whether to retry the request
 */
function shouldRetry(status) {
  return [429, 502, 503, 524].includes(status);
}

/**
 * Creates an AbortController with automatic timeout
 * Useful for canceling requests that take too long
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Object} - Object with controller and timeout ID {controller, timeoutId}
 */
function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  return { controller, timeoutId };
}

/**
 * Waits for a specified amount of time (async sleep)
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} - Promise that resolves after the delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a delay promise that can be used in retry logic
 * @param {number} attempt - Current attempt number (0-based)
 * @param {string} retryAfter - Optional Retry-After header value
 * @returns {Promise} - Promise that resolves after the calculated delay
 */
function delayForRetry(attempt, retryAfter) {
  const delay = calculateRetryDelay(attempt, retryAfter);
  return sleep(delay);
}

/**
 * Converts a File or Blob to base64 data URL
 * @param {File|Blob} file - File or Blob to convert
 * @returns {Promise<string>} - Base64 data URL
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    addJitter,
    calculateRetryDelay,
    shouldRetry,
    createTimeoutController,
    sleep,
    delayForRetry,
    fileToBase64
  };
} else if (typeof window !== 'undefined') {
  // Browser environment - attach to window for global access
  window.WarpmindUtils = {
    addJitter,
    calculateRetryDelay,
    shouldRetry,
    createTimeoutController,
    sleep,
    delayForRetry,
    fileToBase64
  };
}
