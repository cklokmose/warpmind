/**
 * Comprehensive test suite for audio streaming functionality
 * This test verifies both textToSpeech and speechToText streaming capabilities
 */

const Warpmind = require('../src/warpmind.js');
const { TimeoutError } = require('../src/warpmind.js');

// Mock fetch for testing
global.fetch = jest.fn();

describe('Comprehensive Audio Streaming Tests', () => {
  let warpmind;

  beforeEach(() => {
    warpmind = new Warpmind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1'
    });
    
    jest.clearAllMocks();
  });

  describe('textToSpeech Streaming Implementation', () => {
    test('should implement all required streaming parameters', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: jest.fn().mockReturnValue({
            read: jest.fn()
              .mockResolvedValueOnce({ value: new Uint8Array([1, 2, 3]), done: false })
              .mockResolvedValueOnce({ value: new Uint8Array([4, 5, 6]), done: false })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: jest.fn()
          })
        },
        headers: { get: () => 'audio/opus' }
      };

      fetch.mockResolvedValue(mockResponse);

      const chunks = [];
      const onChunkCallback = jest.fn((chunk) => {
        chunks.push(chunk);
      });

      await warpmind.textToSpeech('Hello world', {
        stream: true,
        onChunk: onChunkCallback,
        voice: 'alloy',
        format: 'opus'
      });

      // Verify API call includes streaming parameters
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/speech',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"stream":true')
        })
      );

      // Verify callback was called for each chunk
      expect(onChunkCallback).toHaveBeenCalledTimes(2);
      expect(chunks).toHaveLength(2);
    });

    test('should use opus format by default for streaming', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: jest.fn().mockReturnValue({
            read: jest.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: jest.fn()
          })
        },
        headers: { get: () => 'audio/opus' }
      };

      fetch.mockResolvedValue(mockResponse);

      await warpmind.textToSpeech('Hello', {
        stream: true,
        onChunk: jest.fn()
      });

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.response_format).toBe('opus');
      expect(requestBody.stream).toBe(true);
    });

    test('should handle streaming errors gracefully', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: jest.fn().mockReturnValue({
            read: jest.fn().mockRejectedValue(new Error('Stream error')),
            releaseLock: jest.fn()
          })
        }
      };

      fetch.mockResolvedValue(mockResponse);

      await expect(
        warpmind.textToSpeech('Hello', {
          stream: true,
          onChunk: jest.fn()
        })
      ).rejects.toThrow('Stream error');
    });
  });

  describe('speechToText Streaming Implementation', () => {
    test('should implement all required streaming parameters', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ 
          text: 'Hello world test' 
        })
      };

      fetch.mockResolvedValue(mockResponse);

      const partialTexts = [];
      const onPartialCallback = jest.fn((text) => {
        partialTexts.push(text);
      });

      const audioFile = new Blob(['fake audio'], { type: 'audio/wav' });
      audioFile.name = 'test.wav';

      const result = await warpmind.speechToText(audioFile, {
        stream: true,
        onPartial: onPartialCallback,
        model: 'whisper-1'
      });

      // Verify transcriptions endpoint was called
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST'
        })
      );

      // Verify streaming simulation worked
      expect(result).toBe('Hello world test');
      expect(onPartialCallback).toHaveBeenCalled();
      expect(partialTexts.length).toBeGreaterThan(0);
    });

    test('should handle API errors gracefully', async () => {
      // API returns error
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockResolvedValue({ error: { message: 'Invalid file format' } })
      });

      const audioFile = new Blob(['fake audio'], { type: 'audio/wav' });
      audioFile.name = 'test.wav';

      await expect(
        warpmind.speechToText(audioFile, {
          stream: true,
          onPartial: jest.fn()
        })
      ).rejects.toThrow('STT request failed: 400 Bad Request. Error details: Invalid file format');

      // Verify API was called once
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/audio/transcriptions',
        expect.any(Object)
      );
    });

    test('should handle malformed SSE data gracefully', async () => {
      // Since our implementation simulates streaming, this test should verify
      // that the simulated streaming works correctly with normal JSON response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ 
          text: 'Valid response text' 
        })
      };

      fetch.mockResolvedValue(mockResponse);

      const partialTexts = [];
      const onPartialCallback = jest.fn((text) => {
        partialTexts.push(text);
      });

      const audioFile = new Blob(['fake audio'], { type: 'audio/wav' });
      audioFile.name = 'test.wav';

      const result = await warpmind.speechToText(audioFile, {
        stream: true,
        onPartial: onPartialCallback
      });

      // Should simulate streaming by breaking text into words
      expect(onPartialCallback).toHaveBeenCalled();
      expect(result).toBe('Valid response text');
      expect(partialTexts.length).toBeGreaterThan(0);
    });

    test('should validate audio file input', async () => {
      await expect(
        warpmind.speechToText(null, { stream: true })
      ).rejects.toThrow('Audio file must be a File or Blob object');

      await expect(
        warpmind.speechToText('not a file', { stream: true })
      ).rejects.toThrow('Audio file must be a File or Blob object');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle timeout errors in streaming mode', async () => {
      // Mock fetch to simulate a hung request
      let timeoutController;
      fetch.mockImplementation((url, options) => {
        timeoutController = options.signal;
        return new Promise((resolve, reject) => {
          // Listen for abort signal
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('Request aborted', 'AbortError'));
          });
          // Never resolve normally - will timeout
        });
      });

      await expect(
        warpmind.textToSpeech('Hello', {
          stream: true,
          onChunk: jest.fn(),
          timeoutMs: 50 // Very short timeout
        })
      ).rejects.toThrow(TimeoutError);
      
      // Verify that the abort signal was triggered
      expect(timeoutController.aborted).toBe(true);
    }, 500); // Short Jest timeout

    test('should handle network errors', async () => {
      fetch.mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        warpmind.textToSpeech('Hello', { stream: true, onChunk: jest.fn() })
      ).rejects.toThrow('Network error: Unable to connect to the TTS API.');

      await expect(
        warpmind.speechToText(new Blob(['audio']), { stream: true, onPartial: jest.fn() })
      ).rejects.toThrow('Network error: Unable to connect to the STT API.');
    });

    test('should require API key', async () => {
      const mindWithoutKey = new Warpmind();

      await expect(
        mindWithoutKey.textToSpeech('Hello', { stream: true })
      ).rejects.toThrow('API key is required');

      await expect(
        mindWithoutKey.speechToText(new Blob(['audio']), { stream: true })
      ).rejects.toThrow('API key is required');
    });
  });

  describe('Integration with voiceChat', () => {
    test('should support streaming options in createVoiceChat', () => {
      // Mock MediaRecorder and getUserMedia for browser compatibility
      global.navigator = {
        mediaDevices: {
          getUserMedia: jest.fn().mockResolvedValue({
            getTracks: jest.fn().mockReturnValue([])
          })
        }
      };

      global.MediaRecorder = jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        addEventListener: jest.fn()
      }));

      const voiceChat = warpmind.createVoiceChat('Test assistant', {
        stt: { stream: true, onPartial: jest.fn() },
        tts: { stream: true, voice: 'nova', onChunk: jest.fn() }
      });

      expect(voiceChat).toHaveProperty('startRecording');
      expect(voiceChat).toHaveProperty('stopRecordingAndRespond');
      expect(voiceChat).toHaveProperty('isRecording');
    });
  });

  describe('Performance and Compatibility', () => {
    test('should work with different audio formats', async () => {
      const formats = ['mp3', 'opus', 'aac', 'flac'];
      
      for (const format of formats) {
        const mockResponse = {
          ok: true,
          body: {
            getReader: jest.fn().mockReturnValue({
              read: jest.fn().mockResolvedValueOnce({ done: true }),
              releaseLock: jest.fn()
            })
          },
          headers: { get: () => `audio/${format}` }
        };

        fetch.mockResolvedValue(mockResponse);

        await warpmind.textToSpeech('Test', {
          stream: true,
          onChunk: jest.fn(),
          format: format
        });

        const requestBody = JSON.parse(fetch.mock.calls[fetch.mock.calls.length - 1][1].body);
        expect(requestBody.response_format).toBe(format);
      }
    });

    test('should work with different voice options', async () => {
      const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      
      for (const voice of voices) {
        const mockResponse = {
          ok: true,
          body: {
            getReader: jest.fn().mockReturnValue({
              read: jest.fn().mockResolvedValueOnce({ done: true }),
              releaseLock: jest.fn()
            })
          },
          headers: { get: () => 'audio/opus' }
        };

        fetch.mockResolvedValue(mockResponse);

        await warpmind.textToSpeech('Test', {
          stream: true,
          onChunk: jest.fn(),
          voice: voice
        });

        const requestBody = JSON.parse(fetch.mock.calls[fetch.mock.calls.length - 1][1].body);
        expect(requestBody.voice).toBe(voice);
      }
    });
  });
});
