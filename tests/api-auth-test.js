/**
 * Test suite for API authentication headers
 * Ensures all methods use proper Authorization header format
 */

const Warpmind = require('../src/warpmind.js');

// Mock fetch for testing
global.fetch = jest.fn();

describe('API Authentication Tests', () => {
  let warpmind;

  beforeEach(() => {
    warpmind = new Warpmind({
      apiKey: 'sk-test-key-123',
      baseURL: 'https://api.test.com/v1'
    });
    
    jest.clearAllMocks();
  });

  test('textToSpeech should use Authorization header', async () => {
    const mockBlob = new Blob(['fake audio'], { type: 'audio/mp3' });
    fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
      headers: { get: () => 'audio/mp3' }
    });

    await warpmind.textToSpeech('Hello');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/audio/speech',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key-123'
        })
      })
    );
  });

  test('speechToText should use Authorization header', async () => {
    const mockFile = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Hello world' })
    });

    await warpmind.speechToText(mockFile);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/audio/transcriptions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key-123'
        })
      })
    );
  });

  test('chat should use Authorization header', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello!' } }]
      })
    });

    await warpmind.chat('Hello');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key-123'
        })
      })
    );
  });

  test('streamChat should use Authorization header', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.close();
      }
    });

    fetch.mockResolvedValue({
      ok: true,
      body: mockStream
    });

    await warpmind.streamChat('Hello', () => {});

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key-123'
        })
      })
    );
  });

  test('speechToText streaming should simulate streaming when onPartial is provided', async () => {
    const mockFile = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
    const partialResults = [];
    
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Hello world from streaming' })
    });

    const result = await warpmind.speechToText(mockFile, {
      stream: true,
      onPartial: (text) => partialResults.push(text)
    });

    expect(result).toBe('Hello world from streaming');
    expect(partialResults.length).toBeGreaterThan(1);
    expect(partialResults[0]).toBe('Hello');
    expect(partialResults[partialResults.length - 1]).toBe('Hello world from streaming');
  });
});
