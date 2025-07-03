/**
 * Warpmind - A simple library for easy use of OpenAI-compatible APIs for students
 * Designed to work with school proxy servers using custom authentication keys
 */

class Warpmind {
  constructor(config = {}) {
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gpt-3.5-turbo';
    this.maxTokens = config.maxTokens || 150;
    this.temperature = config.temperature || 0.7;
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
   * @param {number} params.maxTokens - Maximum tokens to generate
   * @param {number} params.temperature - Temperature for randomness (0-2)
   */
  configure(params = {}) {
    if (params.maxTokens !== undefined) this.maxTokens = params.maxTokens;
    if (params.temperature !== undefined) this.temperature = params.temperature;
    if (params.model !== undefined) this.model = params.model;
  }

  /**
   * Make a request to the OpenAI-compatible API with proper headers
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise} - API response
   */
  async makeRequest(endpoint, data) {
    if (!this.apiKey) {
      throw new Error('API key is required. Use setApiKey() to set your proxy authentication key.');
    }

    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey // Custom header for proxy authentication
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to the API. Please check your internet connection.');
      }
      throw error;
    }
  }

  /**
   * Generate a chat completion
   * @param {string|Array} messages - Single message string or array of message objects
   * @param {Object} options - Optional parameters
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
      max_tokens: options.max_tokens || options.maxTokens || this.maxTokens,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature
    };

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.maxTokens;
    delete filteredOptions.max_tokens;
    delete filteredOptions.model;
    delete filteredOptions.temperature;
    
    Object.assign(requestData, filteredOptions);

    const response = await this.makeRequest('/chat/completions', requestData);
    return response.choices[0]?.message?.content || '';
  }

  /**
   * Generate a simple completion (legacy)
   * @param {string} prompt - The prompt text
   * @param {Object} options - Optional parameters
   * @returns {Promise<string>} - The generated response
   */
  async complete(prompt, options = {}) {
    const requestData = {
      model: options.model || 'gpt-3.5-turbo-instruct',
      prompt: prompt,
      max_tokens: options.max_tokens || options.maxTokens || this.maxTokens,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature
    };

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.maxTokens;
    delete filteredOptions.max_tokens;
    delete filteredOptions.model;
    delete filteredOptions.temperature;
    
    Object.assign(requestData, filteredOptions);

    const response = await this.makeRequest('/completions', requestData);
    return response.choices[0]?.text || '';
  }

  /**
   * Ask a simple question and get a response
   * @param {string} question - The question to ask
   * @param {Object} options - Optional parameters
   * @returns {Promise<string>} - The AI response
   */
  async ask(question, options = {}) {
    return await this.chat(question, options);
  }

  /**
   * Stream chat completion (for real-time responses)
   * @param {string|Array} messages - Single message string or array of message objects
   * @param {Function} onChunk - Callback function for each chunk
   * @param {Object} options - Optional parameters
   * @returns {Promise<string>} - The complete generated response
   */
  async streamChat(messages, onChunk, options = {}) {
    if (typeof messages === 'string') {
      messages = [{ role: 'user', content: messages }];
    }

    const requestData = {
      model: options.model || this.model,
      messages: messages,
      max_tokens: options.max_tokens || options.maxTokens || this.maxTokens,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature,
      stream: true
    };

    // Add other options, but filter out our custom ones to avoid conflicts
    const filteredOptions = { ...options };
    delete filteredOptions.maxTokens;
    delete filteredOptions.max_tokens;
    delete filteredOptions.model;
    delete filteredOptions.temperature;
    delete filteredOptions.stream;
    
    Object.assign(requestData, filteredOptions);

    const url = `${this.baseURL}/chat/completions`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                if (onChunk) onChunk(content);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      }

      return fullResponse;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Analyze an image with AI
   * @param {string|File|Blob} image - Image URL, File object, or Blob
   * @param {string} prompt - Question or instruction about the image
   * @param {Object} options - Optional parameters
   * @returns {Promise<string>} - AI analysis of the image
   */
  async analyzeImage(image, prompt = "What do you see in this image?", options = {}) {
    let imageContent;

    // Handle different image input types
    if (typeof image === 'string') {
      // URL or base64 string
      if (image.startsWith('data:image/')) {
        imageContent = {
          type: "image_url",
          image_url: {
            url: image
          }
        };
      } else {
        imageContent = {
          type: "image_url",
          image_url: {
            url: image
          }
        };
      }
    } else if (image instanceof File || image instanceof Blob) {
      // Convert File/Blob to base64
      const base64 = await this._fileToBase64(image);
      imageContent = {
        type: "image_url",
        image_url: {
          url: base64
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
   * @returns {Promise<Blob>} - Audio data as Blob
   */
  async textToSpeech(text, options = {}) {
    const requestData = {
      model: options.model || 'tts-1',
      input: text,
      voice: options.voice || 'alloy',
      response_format: options.format || 'mp3',
      speed: options.speed || 1.0
    };

    const url = `${this.baseURL}/audio/speech`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
      }

      return await response.blob();
    } catch (error) {
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
   * @returns {Promise<string>} - Transcribed text
   */
  async speechToText(audioFile, options = {}) {
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

    const url = `${this.baseURL}/audio/transcriptions`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`STT request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
      }

      const result = await response.json();
      return result.text || '';
    } catch (error) {
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