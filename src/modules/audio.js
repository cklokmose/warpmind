/**
 * Audio module for WarpMind - Contains all audio-related operations
 * Includes text-to-speech, speech-to-text, and voice chat functionality
 */

// Import required utilities
let createTimeoutController, TimeoutError;

if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  const { createTimeoutController: ctc } = require('../util.js');
  const { TimeoutError: te } = require('../core/base-client.js');
  createTimeoutController = ctc;
  TimeoutError = te;
} else {
  // Browser environment - utilities should be available globally
  createTimeoutController = window.createTimeoutController;
  TimeoutError = window.TimeoutError;
}

/**
 * Audio module factory function that accepts a client instance
 * @param {Object} client - The client instance (BaseClient or WarpMind)
 * @returns {Object} - Object with audio methods to be mixed into the main class
 */
function createAudioModule(client) {
  return {
    /**
     * Convert text to speech using TTS
     * @param {string} text - Text to convert to speech
     * @param {Object} options - Optional parameters
     * @param {string} options.model - TTS model (default: 'tts-1')
     * @param {string} options.voice - Voice to use: alloy, echo, fable, onyx, nova, shimmer (default: 'alloy')
     * @param {string} options.format - Audio format: mp3, opus, aac, flac (default: 'mp3')
     * @param {number} options.speed - Speech speed: 0.25 to 4.0 (default: 1.0)
     * @param {boolean} options.stream - Enable streaming for real-time audio (default: false)
     * @param {Function} options.onChunk - Callback for streaming chunks (chunk) => {}
     * @param {number} options.timeoutMs - Request timeout in milliseconds
     * @returns {Promise<Blob>} - Audio data as Blob, or Promise<void> if streaming
     */
    async textToSpeech(text, options = {}) {
      if (!client.apiKey) {
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

      const timeoutMs = options.timeoutMs || client.defaultTimeoutMs;
      const { controller, timeoutId } = createTimeoutController(timeoutMs);
      const url = client._buildApiUrl('/audio/speech');
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': client.apiKey
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
    },

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
      if (!client.apiKey) {
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

      const timeoutMs = options.timeoutMs || client.defaultTimeoutMs;
      const { controller, timeoutId } = createTimeoutController(timeoutMs);
      
      // Always use the standard transcriptions endpoint
      const url = client._buildApiUrl('/audio/transcriptions');
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'api-key': client.apiKey
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
    },

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
    },

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
      const self = this; // Reference to the audio module methods

      if (systemPrompt) {
        conversation.push({ role: 'system', content: systemPrompt });
      }

      const voiceChat = {
        /**
         * Start recording audio from the user
         */
        async startRecording() {
          if (isRecording) {
            throw new Error('Already recording');
          }

          try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
              audio: { 
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
              } 
            });
            
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm;codecs=opus'
            });
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };
            
            mediaRecorder.start();
            isRecording = true;
          } catch (error) {
            throw new Error(`Failed to start recording: ${error.message}`);
          }
        },

        /**
         * Stop recording and process the conversation
         */
        async stopRecording() {
          if (!isRecording || !mediaRecorder) {
            throw new Error('Not currently recording');
          }

          return new Promise(async (resolve, reject) => {
            mediaRecorder.onstop = async () => {
              isRecording = false;
              
              // Stop all tracks to release microphone
              if (mediaRecorder.stream) {
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
              }

              try {
                // Create audio blob from recorded chunks
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                
                // Convert speech to text
                const userMessage = await self.speechToText(audioBlob, options.stt || {});
                conversation.push({ role: 'user', content: userMessage });
                
                // Get AI response
                const aiResponse = await client.chat(conversation, options.chat || {});
                conversation.push({ role: 'assistant', content: aiResponse });
                
                // Convert AI response to speech
                const speechBlob = await self.textToSpeech(aiResponse, options.tts || {});
                
                resolve({
                  userMessage,
                  aiResponse,
                  audioBlob: speechBlob,
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
      
      // Add alias for backward compatibility
      voiceChat.stopRecordingAndRespond = voiceChat.stopRecording;
      
      return voiceChat;
    }
  };
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = createAudioModule;
} else {
  // Browser environment
  window.createAudioModule = createAudioModule;
}
