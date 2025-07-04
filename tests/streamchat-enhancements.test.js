/**
 * Test suite for streamChat enhancements
 * Tests the new { type: "chunk", content } callback format
 */

const WarpMind = require('../src/warpmind.js');

// Mock eventsource-parser
jest.mock('eventsource-parser', () => ({
  createParser: jest.fn()
}));

const { createParser } = require('eventsource-parser');

describe('WarpMind streamChat Enhancements', () => {
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

    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  describe('Enhanced Callback Format', () => {
    test('should emit chunks in { type: "chunk", content } format', async () => {
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

      // Mock parseSSE to call the event callback with test data
      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE').mockImplementation(async (reader, onEvent) => {
        // Simulate multiple streaming events
        onEvent({ role: 'assistant', delta: 'Hello' });
        onEvent({ role: 'assistant', delta: ' world' });
        onEvent({ role: 'assistant', delta: '!' });
        return 'Hello world!';
      });

      const result = await warpMind.streamChat('Test message', onChunk);

      // Verify chunks are in the correct format
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'chunk', content: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'chunk', content: ' world' });
      expect(chunks[2]).toEqual({ type: 'chunk', content: '!' });

      // Verify final response is accumulated correctly
      expect(result).toBe('Hello world!');

      parseSSESpy.mockRestore();
    });

    test('should maintain fullResponse internally and return complete text', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValueOnce({ done: true })
          })
        }
      };

      fetch.mockResolvedValue(mockResponse);

      const onChunk = jest.fn();

      // Mock parseSSE to simulate streaming with gaps
      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE').mockImplementation(async (reader, onEvent) => {
        onEvent({ role: 'assistant', delta: 'Part' });
        onEvent({ role: 'assistant', delta: ' ' });
        onEvent({ role: 'assistant', delta: 'one' });
        onEvent({ role: 'assistant', delta: '. ' });
        onEvent({ role: 'assistant', delta: 'Part' });
        onEvent({ role: 'assistant', delta: ' ' });
        onEvent({ role: 'assistant', delta: 'two.' });
        return 'Part one. Part two.';
      });

      const result = await warpMind.streamChat('Test', onChunk);

      // Verify complete response is returned
      expect(result).toBe('Part one. Part two.');
      
      // Verify all chunks were emitted
      expect(onChunk).toHaveBeenCalledTimes(7);

      parseSSESpy.mockRestore();
    });

    test('should handle empty chunks gracefully', async () => {
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

      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE').mockImplementation(async (reader, onEvent) => {
        // Simulate some empty content (shouldn't happen in practice, but test resilience)
        onEvent({ role: 'assistant', delta: '' });
        onEvent({ role: 'assistant', delta: 'Hello' });
        onEvent({ role: 'assistant', delta: '' });
        return 'Hello';
      });

      const result = await warpMind.streamChat('Test', onChunk);

      expect(result).toBe('Hello');
      expect(chunks).toEqual([
        { type: 'chunk', content: '' },
        { type: 'chunk', content: 'Hello' },
        { type: 'chunk', content: '' }
      ]);

      parseSSESpy.mockRestore();
    });

    test('should work without onChunk callback', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValueOnce({ done: true })
          })
        }
      };

      fetch.mockResolvedValue(mockResponse);

      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE').mockImplementation(async (reader, onEvent) => {
        onEvent({ role: 'assistant', delta: 'Test' });
        onEvent({ role: 'assistant', delta: ' response' });
        return 'Test response';
      });

      // Should not throw when no callback provided
      const result = await warpMind.streamChat('Test message', null);
      expect(result).toBe('Test response');

      parseSSESpy.mockRestore();
    });
  });

  describe('Integration with SSE Parser', () => {
    test('should properly integrate parseSSE function', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValueOnce({ done: true })
          })
        }
      };

      fetch.mockResolvedValue(mockResponse);

      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE');
      const onChunk = jest.fn();

      await warpMind.streamChat('Test', onChunk);

      // Verify parseSSE was called with reader and callback
      expect(parseSSESpy).toHaveBeenCalledWith(
        expect.any(Object), // reader
        expect.any(Function) // event callback
      );

      parseSSESpy.mockRestore();
    });

    test('should pass timeout parameter correctly', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      fetch.mockRejectedValue(abortError);

      await expect(
        warpMind.streamChat('Test', null, { timeoutMs: 5000 })
      ).rejects.toThrow('Request timed out after 5000ms');
    });
  });

  describe('Error Handling', () => {
    test('should handle streaming errors correctly', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockResolvedValue({ error: { message: 'Server error' } })
      };

      fetch.mockResolvedValue(mockResponse);

      await expect(
        warpMind.streamChat('Test', jest.fn())
      ).rejects.toThrow('API request failed: 500 Internal Server Error');
    });

    test('should clear timeout on error', async () => {
      const error = new Error('Network error');
      fetch.mockRejectedValue(error);

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      await expect(
        warpMind.streamChat('Test', jest.fn())
      ).rejects.toThrow('Network error');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain API compatibility for existing code', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValueOnce({ done: true })
          })
        }
      };

      fetch.mockResolvedValue(mockResponse);

      // Old-style callback that expects just the content string
      const legacyChunks = [];
      const legacyCallback = (chunk) => {
        // Old code might expect just a string
        if (typeof chunk === 'object' && chunk.content) {
          legacyChunks.push(chunk.content);
        } else {
          legacyChunks.push(chunk);
        }
      };

      const parseSSESpy = jest.spyOn(warpMind, 'parseSSE').mockImplementation(async (reader, onEvent) => {
        onEvent({ role: 'assistant', delta: 'Hello' });
        onEvent({ role: 'assistant', delta: ' there' });
        return 'Hello there';
      });

      const result = await warpMind.streamChat('Test', legacyCallback);

      expect(result).toBe('Hello there');
      expect(legacyChunks).toEqual(['Hello', ' there']);

      parseSSESpy.mockRestore();
    });
  });
});
