/**
 * Test suite for SSE Parser functionality in WarpMind
 * Tests the parseSSE function and its integration with streaming methods
 */

const WarpMind = require('../src/warpmind.js');

// Mock eventsource-parser
jest.mock('eventsource-parser', () => ({
  createParser: jest.fn()
}));

const { createParser } = require('eventsource-parser');

describe('WarpMind SSE Parser Tests', () => {
  let warpMind;
  let mockParser;

  beforeEach(() => {
    warpMind = new WarpMind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1'
    });

    // Mock parser implementation
    mockParser = {
      feed: jest.fn()
    };

    createParser.mockImplementation((onEvent) => {
      mockParser.onEvent = onEvent;
      return mockParser;
    });

    jest.clearAllMocks();
  });

  describe('parseSSE Function', () => {
    test('should parse valid SSE events correctly', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
          })
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n')
          })
          .mockResolvedValueOnce({ done: true })
      };

      const events = [];
      const onEvent = jest.fn((event) => events.push(event));

      // Simulate the parser calling onEvent for each chunk
      createParser.mockImplementation((callback) => {
        mockParser.onEvent = callback;
        return {
          feed: (chunk) => {
            // Simulate parsing the SSE format
            if (chunk.includes('Hello')) {
              callback({
                type: 'event',
                data: '{"choices":[{"delta":{"content":"Hello"}}]}'
              });
            }
            if (chunk.includes('world')) {
              callback({
                type: 'event', 
                data: '{"choices":[{"delta":{"content":" world"}}]}'
              });
            }
          }
        };
      });

      const result = await warpMind.parseSSE(mockReader, onEvent);

      expect(result).toEqual({
        text: 'Hello world',
        id: null,
        usage: null
      });
      expect(onEvent).toHaveBeenCalledTimes(2);
      expect(events[0]).toEqual({ role: 'assistant', delta: 'Hello' });
      expect(events[1]).toEqual({ role: 'assistant', delta: ' world' });
    });

    test('should handle [DONE] event correctly', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: [DONE]\n\n')
          })
          .mockResolvedValueOnce({ done: true })
      };

      const onEvent = jest.fn();

      createParser.mockImplementation((callback) => ({
        feed: (chunk) => {
          if (chunk.includes('[DONE]')) {
            callback({
              type: 'event',
              data: '[DONE]'
            });
          }
        }
      }));

      const result = await warpMind.parseSSE(mockReader, onEvent);

      expect(result).toEqual({
        text: '',
        id: null,
        usage: null
      });
      expect(onEvent).not.toHaveBeenCalled();
    });

    test('should handle malformed JSON gracefully', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: invalid json\n\n')
          })
          .mockResolvedValueOnce({ done: true })
      };

      const onEvent = jest.fn();
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      createParser.mockImplementation((callback) => ({
        feed: (chunk) => {
          if (chunk.includes('invalid json')) {
            callback({
              type: 'event',
              data: 'invalid json'
            });
          }
        }
      }));

      const result = await warpMind.parseSSE(mockReader, onEvent);

      expect(result).toEqual({
        text: '',
        id: null,
        usage: null
      });
      expect(onEvent).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse SSE event:', expect.any(String));
      
      consoleSpy.mockRestore();
    });

    test('should accumulate full response correctly', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: true })
      };

      createParser.mockImplementation((callback) => ({
        feed: jest.fn()
      }));

      const result = await warpMind.parseSSE(mockReader);

      expect(result).toEqual({
        text: '',
        id: null,
        usage: null
      });
    });
  });

  describe('streamChat Integration', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    test('should use parseSSE in streamChat', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: true })
          })
        }
      };

      fetch.mockResolvedValue(mockResponse);

      // Mock parseSSE to simulate the internal accumulation behavior
      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE').mockImplementation(async (reader, onEvent) => {
        // Simulate the parseSSE calling onEvent and building fullResponse internally
        onEvent({ role: 'assistant', delta: 'Test response' });
        return 'Test response'; // parseSSE returns the accumulated response
      });

      const onChunk = jest.fn();
      const result = await warpMind.streamChat('Hello', onChunk);

      expect(parseSSESpy).toHaveBeenCalled();
      expect(result).toBe('Test response');
      
      parseSSESpy.mockRestore();
    });

    test('should handle timeout in streamChat with SSE parser', async () => {
      // Mock a hanging request
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      fetch.mockRejectedValue(abortError);

      await expect(
        warpMind.streamChat('Hello', null, { timeoutMs: 1000 })
      ).rejects.toThrow('Request timed out after 1000ms');
    });

    test('should pass events to onChunk callback correctly', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValueOnce({ done: true })
          })
        }
      };

      fetch.mockResolvedValue(mockResponse);

      const chunks = [];
      const onChunk = jest.fn((chunk) => chunks.push(chunk));

      // Mock parseSSE to call the event callback which streamChat converts to enhanced format
      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE').mockImplementation(async (reader, onEvent) => {
        // Simulate events - parseSSE calls onEvent with { role, delta }
        onEvent({ role: 'assistant', delta: 'Hello' });
        onEvent({ role: 'assistant', delta: ' world' });
        return 'Hello world';
      });

      const result = await warpMind.streamChat('Test', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      // streamChat converts the parseSSE events to enhanced format: { type: "chunk", content }
      expect(chunks).toEqual([
        { type: "chunk", content: "Hello" },
        { type: "chunk", content: " world" }
      ]);
      expect(result).toBe('Hello world');
      
      parseSSESpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should throw error when reader fails', async () => {
      const mockReader = {
        read: jest.fn().mockRejectedValue(new Error('Reader failed'))
      };

      createParser.mockImplementation(() => ({
        feed: jest.fn()
      }));

      await expect(warpMind.parseSSE(mockReader)).rejects.toThrow('SSE parsing failed: Reader failed');
    });

    test('should handle SSE parser creation errors', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true })
      };

      createParser.mockImplementation(() => {
        throw new Error('Parser creation failed');
      });

      await expect(warpMind.parseSSE(mockReader)).rejects.toThrow('Parser creation failed');
    });
  });
});
