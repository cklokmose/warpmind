/**
 * Warpmind - A simple library for easy use of OpenAI-compatible APIs for students
 * Designed to work with school proxy servers using custom authentication keys
 */

// Import utility functions for better modularity
let addJitter, calculateRetryDelay, shouldRetry, createTimeoutController, sleep, delayForRetry;

// Import base client and TimeoutError
const { BaseClient, TimeoutError } = require('./core/base-client.js');

if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  const utils = require('./util.js');
  ({ 
    addJitter, 
    calculateRetryDelay, 
    shouldRetry, 
    createTimeoutController, 
    sleep, 
    delayForRetry 
  } = utils);
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
      delayForRetry 
    } = utils);
  } catch (error) {
    throw new Error('Utility functions are required. Please ensure util.js is bundled with your application.');
  }
}

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

class Warpmind extends BaseClient {
  constructor(config = {}) {
    super(config); // Call BaseClient constructor
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
   * @param {string} options.model - TTS model (default: 'tts-1')
   * @param {string} options.voice - Voice to use (default: 'alloy')
   * @param {string} options.format - Audio format (default: 'mp3')
   * @param {number} options.speed - Speech speed (default: 1.0)
   * @param {boolean} options.stream - Enable streaming for real-time audio (default: false)
   * @param {Function} options.onChunk - Callback for streaming chunks (chunk) => {}
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @returns {Promise<Blob>} - Audio data as Blob, or Promise<void> if streaming
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

    // Add streaming parameter if requested
    if (options.stream) {
      requestData.stream = true;
      // For streaming, use opus format which is better for real-time
      if (!options.format) {
        requestData.response_format = 'opus';
      }
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const { controller, timeoutId } = createTimeoutController(timeoutMs);
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

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
      }

      // Handle streaming response
      if (options.stream && options.onChunk) {
        const reader = response.body.getReader();
        const chunks = [];
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            // Store chunk for final blob and call callback
            chunks.push(value);
            options.onChunk(value);
          }
          
          clearTimeout(timeoutId);
          
          // Return combined blob for compatibility
          return new Blob(chunks, { type: response.headers.get('content-type') || 'audio/opus' });
        } finally {
          reader.releaseLock();
        }
      } else {
        // Standard non-streaming response
        clearTimeout(timeoutId);
        return await response.blob();
      }
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
   * @param {string} options.model - STT model (default: 'whisper-1')
   * @param {string} options.language - Language code (optional)
   * @param {string} options.prompt - Prompt to guide transcription (optional)
   * @param {number} options.temperature - Sampling temperature (optional)
   * @param {boolean} options.stream - Enable streaming for partial transcripts (default: false)
   * @param {Function} options.onPartial - Callback for partial transcripts (text) => {}
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
    
    // Ensure the file has a proper name and extension
    const fileName = audioFile.name || 'audio.wav';
    formData.append('file', audioFile, fileName);
    formData.append('model', options.model || 'whisper-1');
    
    // Optional parameters - only add if they exist
    if (options.language) {
      formData.append('language', options.language);
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }
    if (options.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
    }

    // For streaming, we'll use verbose_json response format - but don't add timestamp_granularities for basic proxy compatibility
    if (options.stream) {
      formData.append('response_format', 'verbose_json');
      // Commented out as this might not be supported by all proxy servers
      // formData.append('timestamp_granularities[]', 'word');
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const { controller, timeoutId } = createTimeoutController(timeoutMs);
    
    // Always use the standard transcriptions endpoint
    const url = `${this.baseURL}/audio/transcriptions`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey
          // Don't set Content-Type for FormData - let browser set it with boundary
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        let errorDetails = '';
        try {
          const errorData = await response.json();
          errorDetails = errorData.error?.message || JSON.stringify(errorData);
        } catch (e) {
          // If we can't parse JSON, try to get text
          try {
            errorDetails = await response.text();
          } catch (e2) {
            errorDetails = 'Unable to parse error response';
          }
        }
        
        // Enhanced error message with more details
        throw new Error(`STT request failed: ${response.status} ${response.statusText}. Error details: ${errorDetails}`);
      }

      clearTimeout(timeoutId);
      const result = await response.json();
      
      // If streaming was requested but API doesn't support it, simulate streaming
      if (options.stream && options.onPartial && result.text) {
        // Simulate streaming by breaking the text into chunks
        const words = result.text.split(' ');
        let currentText = '';
        
        // Emit partial results word by word with small delays
        for (let i = 0; i < words.length; i++) {
          currentText += (i > 0 ? ' ' : '') + words[i];
          options.onPartial(currentText);
          
          // Small delay to simulate streaming (only if more words remain)
          if (i < words.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        return result.text;
      } else {
        // Standard non-streaming response
        return result.text || '';
      }
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