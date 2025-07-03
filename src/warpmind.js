/**
 * Warpmind - A simple library for easy use of OpenAI-compatible APIs for students
 * Designed to work with school proxy servers using custom authentication keys
 */

// Import eventsource-parser for robust SSE parsing (compatible with browser and Node.js)
let createParser;

if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  try {
    createParser = require('eventsource-parser').createParser;
  } catch (error) {
    throw new Error('eventsource-parser is required for SSE streaming support. Please install it with: npm install eventsource-parser');
  }
} else {
  // Browser environment - webpack should bundle eventsource-parser
  try {
    // Use dynamic import that webpack can resolve
    const EventSourceParser = require('eventsource-parser');
    createParser = EventSourceParser.createParser;
  } catch (error) {
    throw new Error('eventsource-parser is required for SSE streaming support. Please ensure it is bundled with your application.');
  }
}

/**
 * Custom error class for timeout errors
 */
class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class Warpmind {
  constructor(config = {}) {
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gpt-3.5-turbo';
    this.temperature = config.temperature || 0.7;
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
   */
  configure(params = {}) {
    if (params.temperature !== undefined) this.temperature = params.temperature;
    if (params.model !== undefined) this.model = params.model;
  }

  /**
   * Adds jitter to delay calculation for exponential back-off
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {number} - Delay with added jitter
   */
  _addJitter(baseDelay) {
    const jitter = Math.random() * 250; // 0-250ms jitter
    return baseDelay + jitter;
  }

  /**
   * Calculates delay for exponential back-off
   * @param {number} attempt - Current attempt number (0-based)
   * @param {string} retryAfter - Retry-After header value in seconds
   * @returns {number} - Delay in milliseconds
   */
  _calculateRetryDelay(attempt, retryAfter) {
    if (retryAfter) {
      return parseInt(retryAfter) * 1000; // Convert seconds to milliseconds
    }
    
    const baseDelay = 500 * Math.pow(2, attempt); // 500ms × 2^attempt
    return this._addJitter(baseDelay);
  }

  /**
   * Checks if an HTTP status code should trigger a retry
   * @param {number} status - HTTP status code
   * @returns {boolean} - Whether to retry the request
   */
  _shouldRetry(status) {
    return [429, 502, 503, 524].includes(status);
  }

  /**
   * Creates an AbortController with timeout
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Object} - Object with controller and timeout ID
   */
  _createTimeoutController(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    
    return { controller, timeoutId };
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
    const url = `${this.baseURL}${endpoint}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { controller, timeoutId } = this._createTimeoutController(timeoutMs);
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey // Custom header for proxy authentication
          },
          body: JSON.stringify(data),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Check if we should retry this status code
          if (this._shouldRetry(response.status) && attempt < maxRetries) {
            const retryAfter = response.headers.get ? response.headers.get('Retry-After') : null;
            const delay = this._calculateRetryDelay(attempt, retryAfter);
            
            console.warn(`Request failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
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
            const delay = this._calculateRetryDelay(attempt);
            console.warn(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error('Network error: Unable to connect to the API. Please check your internet connection.');
        }
        
        // For other errors, don't retry
        throw error;
      }
    }
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
    const { controller, timeoutId } = this._createTimeoutController(timeoutMs);
    
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

  /**
   * Parse Server-Sent Events (SSE) stream and yield structured events
   * @param {ReadableStreamDefaultReader} reader - Stream reader
   * @param {function} onEvent - Callback for each parsed event
   * @returns {Promise<string>} - Complete accumulated response
   */
  async parseSSE(reader, onEvent) {
    const decoder = new TextDecoder();
    let fullResponse = '';
    
    // Create the SSE parser
    const parser = createParser((event) => {
      if (event.type === 'event') {
        if (event.data === '[DONE]') {
          return;
        }
        
        try {
          const parsed = JSON.parse(event.data);
          const delta = parsed.choices?.[0]?.delta;
          
          if (delta?.content) {
            const eventData = {
              role: delta.role || 'assistant',
              delta: delta.content
            };
            
            fullResponse += delta.content;
            if (onEvent) onEvent(eventData);
          }
        } catch (error) {
          console.warn('Failed to parse SSE event:', error.message);
        }
      }
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Feed the chunk to the parser
        const chunk = decoder.decode(value, { stream: true });
        parser.feed(chunk);
      }
    } catch (error) {
      throw new Error(`SSE parsing failed: ${error.message}`);
    }

    return fullResponse;
  }

  /**
   * Analyze an image with AI
   * @param {string|File|Blob} image - Image URL, File object, or Blob
   * @param {string} prompt - Question or instruction about the image
   * @param {Object} options - Optional parameters
   * @param {string} options.detail - Image detail level: "low" (default) or "high". Warning: "high" detail costs ~2x tokens
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<string>} - AI analysis of the image
   */
  async analyzeImage(image, prompt = "What do you see in this image?", options = {}) {
    let imageContent;
    const detail = options.detail || "low";
    
    // Validate detail parameter
    if (detail !== "low" && detail !== "high") {
      throw new Error('options.detail must be "low" or "high"');
    }

    // Handle different image input types
    if (typeof image === 'string') {
      // URL or base64 string
      if (image.startsWith('data:image/')) {
        imageContent = {
          type: "image_url",
          image_url: {
            url: image,
            detail: detail
          }
        };
      } else {
        imageContent = {
          type: "image_url",
          image_url: {
            url: image,
            detail: detail
          }
        };
      }
    } else if (image instanceof File || image instanceof Blob) {
      // Convert File/Blob to base64
      const base64 = await this._fileToBase64(image);
      imageContent = {
        type: "image_url",
        image_url: {
          url: base64,
          detail: detail
        }
      };
    } else {
      throw new Error('Image must be a URL string, File, or Blob object');
    }

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          imageContent
        ]
      }
    ];

    return await this.chat(messages, { 
      model: options.model || 'gpt-4o',
      ...options 
    });
  }

  /**
   * Generate audio from text using text-to-speech
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Optional parameters
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<Blob>} - Audio data as Blob
   */
  async textToSpeech(text, options = {}) {
    if (!this.apiKey) {
      throw new Error('API key is required. Use setApiKey() to set your proxy authentication key.');
    }

    const requestData = {
      model: options.model || 'tts-1',
      input: text,
      voice: options.voice || 'alloy',
      response_format: options.format || 'mp3',
      speed: options.speed || 1.0
    };

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const { controller, timeoutId } = this._createTimeoutController(timeoutMs);
    const url = `${this.baseURL}/audio/speech`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(requestData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
      }

      return await response.blob();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to the TTS API.');
      }
      throw error;
    }
  }

  /**
   * Transcribe audio to text using speech-to-text
   * @param {File|Blob} audioFile - Audio file to transcribe
   * @param {Object} options - Optional parameters
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<string>} - Transcribed text
   */
  async speechToText(audioFile, options = {}) {
    if (!this.apiKey) {
      throw new Error('API key is required. Use setApiKey() to set your proxy authentication key.');
    }

    if (!audioFile || !(audioFile instanceof File || audioFile instanceof Blob)) {
      throw new Error('Audio file must be a File or Blob object');
    }

    const formData = new FormData();
    formData.append('file', audioFile, audioFile.name || 'audio.wav');
    formData.append('model', options.model || 'whisper-1');
    
    if (options.language) {
      formData.append('language', options.language);
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }
    if (options.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const { controller, timeoutId } = this._createTimeoutController(timeoutMs);
    const url = `${this.baseURL}/audio/transcriptions`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey
        },
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`STT request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
      }

      const result = await response.json();
      return result.text || '';
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to the STT API.');
      }
      throw error;
    }
  }

  /**
   * Create an interactive voice conversation
   * @param {string} systemPrompt - System instructions for the AI
   * @param {Object} options - Configuration options
   * @returns {Object} - Voice conversation controller
   */
  createVoiceChat(systemPrompt = "You are a helpful assistant.", options = {}) {
    const conversation = [];
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    const self = this; // Store reference to the Warpmind instance

    if (systemPrompt) {
      conversation.push({ role: 'system', content: systemPrompt });
    }

    return {
      /**
       * Start recording audio from the user
       */
      async startRecording() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };

          mediaRecorder.start();
          isRecording = true;
          return true;
        } catch (error) {
          throw new Error('Failed to start recording: ' + error.message);
        }
      },

      /**
       * Stop recording and get AI response
       */
      async stopRecordingAndRespond() {
        if (!isRecording || !mediaRecorder) {
          throw new Error('No active recording to stop');
        }

        return new Promise((resolve, reject) => {
          mediaRecorder.onstop = async () => {
            try {
              // Create audio blob from recorded chunks
              const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
              
              // Transcribe the audio - use self reference
              const userMessage = await self.speechToText(audioBlob, options.stt || {});
              
              // Add to conversation
              conversation.push({ role: 'user', content: userMessage });
              
              // Get AI response
              const aiResponse = await self.chat(conversation, options.chat || {});
              conversation.push({ role: 'assistant', content: aiResponse });
              
              // Convert response to speech
              const speechBlob = await self.textToSpeech(aiResponse, options.tts || {});
              
              // Clean up
              mediaRecorder.stream.getTracks().forEach(track => track.stop());
              isRecording = false;
              
              resolve({
                userMessage,
                aiResponse,
                speechBlob,
                conversation: [...conversation]
              });
            } catch (error) {
              reject(error);
            }
          };

          mediaRecorder.stop();
        });
      },

      /**
       * Get the current conversation history
       */
      getConversation() {
        return [...conversation];
      },

      /**
       * Clear the conversation history
       */
      clearConversation() {
        conversation.length = 0;
        if (systemPrompt) {
          conversation.push({ role: 'system', content: systemPrompt });
        }
      },

      /**
       * Check if currently recording
       */
      isRecording() {
        return isRecording;
      }
    };
  }

  /**
   * Helper function to convert File/Blob to base64
   * @private
   */
  async _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Play audio from blob (utility function)
   * @param {Blob} audioBlob - Audio data to play
   * @returns {Promise} - Resolves when audio finishes playing
   */
  async playAudio(audioBlob) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(audioBlob);
      
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to play audio'));
      };
      
      audio.src = url;
      audio.play().catch(reject);
    });
  }

  /**
   * Process data or questions with structured JSON output
   * @param {string} prompt - Instructions for what to process or analyze
   * @param {string|Object|Array} data - Optional data to process (text, object, or array)
   * @param {Object} schema - Object describing the expected JSON structure
   * @param {Object} options - Optional parameters
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

        const response = await this.chat(fullPrompt, {
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
        } catch (error) {
          // This will catch both JSON parsing errors and our schema validation errors.
          // We re-throw the error so the retry logic can catch it.
          throw new Error(`Response validation failed: ${error.message}. Raw response: ${response}`);
        }
      } catch (error) {
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
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Warpmind;
  module.exports.TimeoutError = TimeoutError;
} else if (typeof window !== 'undefined') {
  window.Warpmind = Warpmind;
  window.TimeoutError = TimeoutError;
}

// Also attach TimeoutError to Warpmind class for webpack UMD compatibility
Warpmind.TimeoutError = TimeoutError;