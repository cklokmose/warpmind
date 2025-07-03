/**
 * Test suite for streaming textToSpeech and speechToText functionality
 * Tests both regular and streaming modes
 */

// Import the Warpmind class for Node.js testing
const Warpmind = require('../src/warpmind.js');
const { TimeoutError } = require('../src/warpmind.js');

// Mock fetch for testing
global.fetch = jest.fn();

describe('Warpmind Audio Streaming Tests', () => {
  let warpmind;

  beforeEach(() => {
    warpmind = new Warpmind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1'
    });
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any pending timers
    jest.clearAllTimers();
  });

  describe('textToSpeech', () => {
    test('should work in standard non-streaming mode', async () => {
      const mockBlob = new Blob(['fake audio data'], { type: 'audio/mp3' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
        headers: { get: () => 'audio/mp3' }
      };

      fetch.mockResolvedValue(mockResponse);

      const result = await warpmind.textToSpeech('Hello world');
      
      expect(result).toBe(mockBlob);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/speech',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': 'test-key'
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: 'Hello world',
            voice: 'alloy',
            response_format: 'mp3',
            speed: 1.0
          })
        })
      );
    });

    test('should handle streaming mode with onChunk callback', async () => {
      const chunk1 = new Uint8Array([1, 2, 3]);
      const chunk2 = new Uint8Array([4, 5, 6]);
      const chunk3 = new Uint8Array([7, 8, 9]);
      
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: chunk1 })
          .mockResolvedValueOnce({ done: false, value: chunk2 })
          .mockResolvedValueOnce({ done: false, value: chunk3 })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn()
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
        headers: { get: () => 'audio/opus' }
      };

      fetch.mockResolvedValue(mockResponse);

      const chunks = [];
      const onChunk = jest.fn((chunk) => chunks.push(chunk));

      const result = await warpmind.textToSpeech('Hello world', {
        stream: true,
        onChunk: onChunk
      });

      // Should call onChunk for each chunk
      expect(onChunk).toHaveBeenCalledTimes(3);
      expect(onChunk).toHaveBeenNthCalledWith(1, chunk1);
      expect(onChunk).toHaveBeenNthCalledWith(2, chunk2);
      expect(onChunk).toHaveBeenNthCalledWith(3, chunk3);

      // Should return combined blob
      expect(result).toBeInstanceOf(Blob);
      
      // Verify the request included stream parameter
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/speech',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'tts-1',
            input: 'Hello world',
            voice: 'alloy',
            response_format: 'opus', // Should default to opus for streaming
            speed: 1.0,
            stream: true
          })
        })
      );
    });

    test('should use custom options in streaming mode', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn()
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
        headers: { get: () => 'audio/mp3' }
      };

      fetch.mockResolvedValue(mockResponse);

      await warpmind.textToSpeech('Test', {
        stream: true,
        model: 'tts-1-hd',
        voice: 'nova',
        format: 'mp3',
        speed: 1.2,
        onChunk: () => {}
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/speech',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'tts-1-hd',
            input: 'Test',
            voice: 'nova',
            response_format: 'mp3',
            speed: 1.2,
            stream: true
          })
        })
      );
    });

    test('should handle timeout in streaming mode', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      fetch.mockRejectedValue(abortError);

      await expect(
        warpmind.textToSpeech('Hello world', { 
          stream: true, 
          onChunk: () => {},
          timeoutMs: 1000 
        })
      ).rejects.toThrow(TimeoutError);
    });

    test('should handle API errors in streaming mode', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockResolvedValue({ error: { message: 'Invalid voice' } })
      };

      fetch.mockResolvedValue(mockResponse);

      await expect(
        warpmind.textToSpeech('Hello world', { 
          stream: true, 
          onChunk: () => {} 
        })
      ).rejects.toThrow('TTS request failed: 400 Bad Request. Invalid voice');
    });
  });

  describe('speechToText', () => {
    const mockAudioFile = new File(['fake audio'], 'test.wav', { type: 'audio/wav' });

    test('should work in standard non-streaming mode', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ text: 'Hello world transcription' })
      };

      fetch.mockResolvedValue(mockResponse);

      const result = await warpmind.speechToText(mockAudioFile);
      
      expect(result).toBe('Hello world transcription');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'api-key': 'test-key'
          }
        })
      );

      // Check FormData was constructed correctly
      const formData = fetch.mock.calls[0][1].body;
      expect(formData).toBeInstanceOf(FormData);
    });

    test('should handle streaming mode with onPartial callback', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ 
          text: 'Hello world transcription streaming test'
        })
      };

      fetch.mockResolvedValue(mockResponse);

      const partials = [];
      const onPartial = jest.fn((text) => partials.push(text));

      const result = await warpmind.speechToText(mockAudioFile, {
        stream: true,
        onPartial: onPartial
      });

      // Should call onPartial multiple times (simulated streaming)
      expect(onPartial).toHaveBeenCalledTimes(5); // 5 words
      expect(onPartial).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onPartial).toHaveBeenNthCalledWith(2, 'Hello world');
      expect(onPartial).toHaveBeenNthCalledWith(3, 'Hello world transcription');
      expect(onPartial).toHaveBeenNthCalledWith(4, 'Hello world transcription streaming');
      expect(onPartial).toHaveBeenNthCalledWith(5, 'Hello world transcription streaming test');

      // Should return final transcript
      expect(result).toBe('Hello world transcription streaming test');

      // Should use standard transcriptions endpoint
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/transcriptions',
        expect.anything()
      );
    });

    test('should handle API errors properly', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid audio format' }
        })
      };

      fetch.mockResolvedValue(errorResponse);

      await expect(warpmind.speechToText(mockAudioFile, { stream: true }))
        .rejects.toThrow('STT request failed: 400 Bad Request. Error details: Invalid audio format');
    });

    test('should use custom options in streaming mode', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ text: 'Custom test result' })
      };

      fetch.mockResolvedValue(mockResponse);

      await warpmind.speechToText(mockAudioFile, {
        stream: true,
        model: 'whisper-1-large',
        language: 'en',
        prompt: 'Technical discussion',
        temperature: 0.2,
        onPartial: () => {}
      });

      // Verify the request was made with api-key header
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'api-key': 'test-key'
          }
        })
      );
    });

    test('should handle timeout in streaming mode', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      fetch.mockRejectedValue(abortError);

      await expect(
        warpmind.speechToText(mockAudioFile, { 
          stream: true, 
          onPartial: () => {},
          timeoutMs: 1000 
        })
      ).rejects.toThrow(TimeoutError);
    });

    test('should handle streaming with empty result gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ text: '' })
      };

      fetch.mockResolvedValue(mockResponse);

      const onPartial = jest.fn();
      const result = await warpmind.speechToText(mockAudioFile, {
        stream: true,
        onPartial: onPartial
      });

      // Should not call onPartial for empty text
      expect(onPartial).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    test('should validate audio file input', async () => {
      await expect(
        warpmind.speechToText(null)
      ).rejects.toThrow('Audio file must be a File or Blob object');

      await expect(
        warpmind.speechToText('not a file')
      ).rejects.toThrow('Audio file must be a File or Blob object');
    });
  });

  describe('Integration with voiceChat', () => {
    test('should support streaming options in voiceChat', async () => {
      // Mock MediaRecorder and getUserMedia for browser environment
      global.navigator = {
        mediaDevices: {
          getUserMedia: jest.fn().mockResolvedValue({
            getTracks: () => [{ stop: jest.fn() }]
          })
        }
      };

      global.MediaRecorder = jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        addEventListener: jest.fn()
      }));

      const voiceChat = warpmind.createVoiceChat('Test assistant', {
        stt: { stream: true },
        tts: { stream: true, voice: 'nova' }
      });

      expect(voiceChat).toHaveProperty('startRecording');
      expect(voiceChat).toHaveProperty('stopRecordingAndRespond');
      expect(voiceChat).toHaveProperty('isRecording');
    });
  });
});
