/**
 * Tool Call Tracker Module - Manages tool call lifecycle and provides inspection capabilities
 */

class ToolCallTracker {
  constructor() {
    this.activeCalls = new Map();
    this.callHistory = [];
    this.callIdCounter = 0;
  }
  
  /**
   * Start tracking a new tool call
   * @param {string} name - Tool name
   * @param {Object} parameters - Tool parameters
   * @returns {Object} - Tool call object with callId
   */
  startCall(name, parameters) {
    const callId = this.generateCallId();
    const call = {
      callId,
      name,
      parameters: this._sanitizeParameters(parameters),
      timestamp: new Date().toISOString(),
      startTime: performance.now()
    };
    
    this.activeCalls.set(callId, call);
    return call;
  }
  
  /**
   * Mark a tool call as completed
   * @param {string} callId - Call ID
   * @param {*} result - Tool result
   * @returns {Object} - Completed tool call object
   */
  completeCall(callId, result) {
    const call = this.activeCalls.get(callId);
    if (call) {
      const duration = Math.round(performance.now() - call.startTime);
      const completedCall = {
        ...call,
        result: this._sanitizeResult(result),
        duration,
        status: 'completed'
      };
      
      this.activeCalls.delete(callId);
      this.callHistory.push(completedCall);
      return completedCall;
    }
    return null;
  }
  
  /**
   * Mark a tool call as failed
   * @param {string} callId - Call ID
   * @param {Error} error - Error that occurred
   * @returns {Object} - Failed tool call object
   */
  errorCall(callId, error) {
    const call = this.activeCalls.get(callId);
    if (call) {
      const duration = Math.round(performance.now() - call.startTime);
      const errorCall = {
        ...call,
        error: error.message,
        duration,
        status: 'error'
      };
      
      this.activeCalls.delete(callId);
      this.callHistory.push(errorCall);
      return errorCall;
    }
    return null;
  }
  
  /**
   * Generate a unique call ID
   * @returns {string} - Unique call ID
   */
  generateCallId() {
    return `call_${Date.now()}_${++this.callIdCounter}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get current active calls
   * @returns {Array} - Array of active call objects
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }
  
  /**
   * Get call history
   * @param {number} limit - Maximum number of calls to return
   * @returns {Array} - Array of completed/failed call objects
   */
  getCallHistory(limit = 50) {
    return this.callHistory.slice(-limit);
  }
  
  /**
   * Clear call history
   */
  clearHistory() {
    this.callHistory = [];
  }
  
  /**
   * Sanitize parameters to prevent circular references and limit size
   * @param {*} parameters - Parameters to sanitize
   * @returns {*} - Sanitized parameters
   */
  _sanitizeParameters(parameters) {
    try {
      // Convert to JSON and back to remove circular references
      const jsonString = JSON.stringify(parameters);
      
      // Limit size to prevent memory issues
      if (jsonString.length > 10000) {
        return { 
          _truncated: true, 
          _originalSize: jsonString.length,
          _preview: jsonString.substring(0, 1000) + '...'
        };
      }
      
      return JSON.parse(jsonString);
    } catch (error) {
      return { 
        _error: 'Failed to serialize parameters', 
        _type: typeof parameters,
        _message: error.message 
      };
    }
  }
  
  /**
   * Sanitize result to prevent circular references and limit size
   * @param {*} result - Result to sanitize
   * @returns {*} - Sanitized result
   */
  _sanitizeResult(result) {
    try {
      // Convert to JSON and back to remove circular references
      const jsonString = JSON.stringify(result);
      
      // Limit size to prevent memory issues
      if (jsonString.length > 10000) {
        return { 
          _truncated: true, 
          _originalSize: jsonString.length,
          _preview: jsonString.substring(0, 1000) + '...'
        };
      }
      
      return JSON.parse(jsonString);
    } catch (error) {
      return { 
        _error: 'Failed to serialize result', 
        _type: typeof result,
        _message: error.message 
      };
    }
  }
}

module.exports = ToolCallTracker;
