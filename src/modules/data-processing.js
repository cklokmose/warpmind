/**
 * Data Processing module for WarpMind - Contains structured JSON processing operations
 * Handles data analysis, schema validation, and retry logic for structured responses
 */

/**
 * Data processing module factory function that accepts a client instance
 * @param {Object} client - The client instance (BaseClient or WarpMind)
 * @returns {Object} - Object with data processing methods to be mixed into the main class
 */
function createDataProcessingModule(client) {
  return {
    /**
     * Process data or questions with structured JSON output
     * @param {string} prompt - Instructions for what to process or analyze
     * @param {string|Object|Array} data - Optional data to process (text, object, or array)
     * @param {Object} schema - Object describing the expected JSON structure
     * @param {Object} options - Optional parameters
     * @param {number} options.retries - Number of retries for failed JSON parsing (default: 2)
     * @returns {Promise<Object>} - The AI response as a parsed JSON object
     */
    async process(prompt, data = null, schema = {}, options = {}) {
      const { retries = 2, ...restOptions } = options;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Build the full prompt
          let fullPrompt = prompt;
          
          // Add data if provided
          if (data !== null) {
            if (typeof data === 'string') {
              fullPrompt += "\n\nData to process:\n" + data;
            } else {
              fullPrompt += "\n\nData to process:\n" + JSON.stringify(data, null, 2);
            }
          }
          
          // Add schema instructions
          if (Object.keys(schema).length > 0) {
            fullPrompt += "\n\nPlease respond with a JSON object that has these fields:\n";
            for (const [key, description] of Object.entries(schema)) {
              fullPrompt += `- ${key}: ${description}\n`;
            }
            fullPrompt += "\nRespond only with valid JSON, no extra text.";
          } else {
            fullPrompt += "\n\nPlease respond with valid JSON only, no extra text.";
          }

          const response = await client.chat(fullPrompt, {
            ...restOptions,
            response_format: { type: "json_object" }
          });

          try {
            const result = JSON.parse(response);

            // Validate that the response contains all keys from the schema
            if (Object.keys(schema).length > 0) {
              for (const key of Object.keys(schema)) {
                if (!(key in result)) {
                  throw new Error(`AI response is missing the required field: '${key}'`);
                }
              }
            }
            
            return result; // Validation successful
          } catch (parseError) {
            // This will catch both JSON parsing errors and our schema validation errors.
            // We re-throw the error so the retry logic can catch it.
            throw new Error(`Response validation failed: ${parseError.message}. Raw response: ${response}`);
          }
        } catch (error) {
          // If the error came from client.chat (network/API error), re-throw it directly
          // If it came from parsing/validation, it will have the expected message format
          console.warn(`Process attempt ${attempt + 1} failed: ${error.message}`);
          if (attempt === retries) {
              console.error('All process attempts failed.');
              throw error; // All retries failed, re-throw the last error
          }
          // Optional: wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
  };
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = createDataProcessingModule;
} else if (typeof window !== 'undefined') {
  window.createDataProcessingModule = createDataProcessingModule;
}
