/**
 * Conversation class for managing multi-turn conversations with Responses API
 * Uses previous_response_id chaining for conversation continuity
 */

/**
 * Conversation manager with history tracking and localStorage support
 */
class Conversation {
  /**
   * Create a new conversation
   * @param {Object} mind - WarpMind instance
   * @param {Object} options - Conversation options
   * @param {string} options.instructions - System instructions for the conversation
   * @param {string} options.model - Model to use
   */
  constructor(mind, options = {}) {
    this.mind = mind;
    this.instructions = options.instructions;
    this.model = options.model;
    this.previousResponseId = null;
    this.history = []; // Client-side backup
  }

  /**
   * Send a message in the conversation
   * @param {string|Array} input - User input
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Response object
   */
  async respond(input, options = {}) {
    const requestOptions = {
      ...options,
      model: this.model || options.model,
      instructions: this.instructions || options.instructions
    };

    // Use previous_response_id for chaining
    if (this.previousResponseId) {
      requestOptions.previous_response_id = this.previousResponseId;
    }

    const response = await this.mind.respond(input, requestOptions);

    // Update state
    if (response.id) {
      this.previousResponseId = response.id;
    }

    // Keep client-side backup
    const inputText = typeof input === 'string' ? input : JSON.stringify(input);
    this.history.push(
      { role: 'user', content: inputText, timestamp: Date.now() },
      { role: 'assistant', content: response.text, timestamp: Date.now() }
    );

    return response;
  }

  /**
   * Send a streaming message in the conversation
   * @param {string|Array} input - User input
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Final response object
   */
  async streamRespond(input, onChunk, options = {}) {
    const requestOptions = {
      ...options,
      model: this.model || options.model,
      instructions: this.instructions || options.instructions
    };

    // Use previous_response_id for chaining
    if (this.previousResponseId) {
      requestOptions.previous_response_id = this.previousResponseId;
    }

    const response = await this.mind.streamRespond(input, onChunk, requestOptions);

    // Update state
    if (response.id) {
      this.previousResponseId = response.id;
    }

    // Keep client-side backup
    const inputText = typeof input === 'string' ? input : JSON.stringify(input);
    this.history.push(
      { role: 'user', content: inputText, timestamp: Date.now() },
      { role: 'assistant', content: response.text, timestamp: Date.now() }
    );

    return response;
  }

  /**
   * Clear conversation history
   */
  async clear() {
    this.history = [];
    this.previousResponseId = null;
  }

  /**
   * Get conversation history
   * @returns {Array} - History array
   */
  getHistory() {
    return this.history;
  }

  /**
   * Export conversation to JSON string for localStorage
   * @returns {string} - JSON string
   */
  exportHistory() {
    return JSON.stringify({
      history: this.history,
      previousResponseId: this.previousResponseId,
      instructions: this.instructions,
      model: this.model
    });
  }

  /**
   * Import conversation from JSON string
   * @param {string} data - JSON string from exportHistory()
   */
  importHistory(data) {
    try {
      const parsed = JSON.parse(data);
      this.history = parsed.history || [];
      this.previousResponseId = parsed.previousResponseId || null;
      this.instructions = parsed.instructions || this.instructions;
      this.model = parsed.model || this.model;
    } catch (error) {
      console.error('Failed to import conversation history:', error);
    }
  }

  /**
   * Get the number of messages in the conversation
   * @returns {number}
   */
  getMessageCount() {
    return this.history.length;
  }

  /**
   * Get the last message in the conversation
   * @returns {Object|null}
   */
  getLastMessage() {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }
}

module.exports = { Conversation };
