/**
 * Additional tests for base-client to achieve full coverage
 */

const { BaseClient, TimeoutError } = require('../src/core/base-client');

// Mock the util module 
jest.mock('../src/util', () => ({
  ...jest.requireActual('../src/util'),
  sleep: jest.fn().mockResolvedValue(undefined)
}));
const { sleep } = require('../src/util');

// Mock fetch globally
global.fetch = jest.fn();

// Mock AbortController globally
global.AbortController = jest.fn(() => ({
  signal: {},
  abort: jest.fn()
}));

describe('BaseClient Additional Coverage Tests', () => {
  let client;

  beforeEach(() => {
    client = new BaseClient({
      apiKey: 'test-api-key',
      baseURL: 'https://api.openai.com/v1'
    });
    
    fetch.mockClear();
    sleep.mockClear();
  });

  describe('constructor edge cases', () => {
    it('should handle configuration without apiKey', () => {
      const clientWithoutKey = new BaseClient({
        baseURL: 'https://api.openai.com/v1'
      });
      
      expect(clientWithoutKey.apiKey).toBe('');
      expect(clientWithoutKey.baseURL).toBe('https://api.openai.com/v1');
    });

    it('should handle empty configuration object', () => {
      const clientEmpty = new BaseClient({});
      
      expect(clientEmpty.apiKey).toBe('');
      expect(clientEmpty.baseURL).toBe('https://api.openai.com/v1');
      expect(clientEmpty.model).toBe('gpt-4o');
      expect(clientEmpty.temperature).toBe(0.7);
    });

    it('should handle undefined configuration', () => {
      const clientUndefined = new BaseClient();
      
      expect(clientUndefined.apiKey).toBe('');
      expect(clientUndefined.baseURL).toBe('https://api.openai.com/v1');
    });

    it('should apply custom configuration values', () => {
      const customClient = new BaseClient({
        apiKey: 'custom-key',
        baseURL: 'https://custom.api.com/v1',
        model: 'gpt-3.5-turbo',
        temperature: 0.5,
        defaultTimeoutMs: 60000
      });
      
      expect(customClient.apiKey).toBe('custom-key');
      expect(customClient.baseURL).toBe('https://custom.api.com/v1');
      expect(customClient.model).toBe('gpt-3.5-turbo');
      expect(customClient.temperature).toBe(0.5);
      expect(customClient.defaultTimeoutMs).toBe(60000);
    });
  });

  describe('configuration methods', () => {
    it('should set API key using setApiKey method', () => {
      client.setApiKey('new-api-key');
      expect(client.apiKey).toBe('new-api-key');
    });

    it('should set base URL using setBaseURL method', () => {
      client.setBaseURL('https://new.api.com/v2');
      expect(client.baseURL).toBe('https://new.api.com/v2');
    });

    it('should set model using setModel method', () => {
      client.setModel('gpt-3.5-turbo');
      expect(client.model).toBe('gpt-3.5-turbo');
    });

    it('should configure multiple properties using configure method', () => {
      client.configure({
        apiKey: 'configured-key',
        baseURL: 'https://configured.api.com',
        model: 'configured-model',
        temperature: 0.1
      });
      
      expect(client.apiKey).toBe('configured-key');
      expect(client.baseURL).toBe('https://configured.api.com');
      expect(client.model).toBe('configured-model');
      expect(client.temperature).toBe(0.1);
    });

    it('should handle partial configuration in configure method', () => {
      const originalModel = client.model;
      
      client.configure({
        apiKey: 'partial-key'
      });
      
      expect(client.apiKey).toBe('partial-key');
      expect(client.model).toBe(originalModel); // Should remain unchanged
    });
  });

  describe('makeRequest error handling edge cases', () => {
    it('should handle fetch errors that are not AbortError or retryable', async () => {
      const networkError = new Error('DNS resolution failed');
      fetch.mockRejectedValueOnce(networkError);

      await expect(client.makeRequest('/test', {})).rejects.toThrow('DNS resolution failed');
    });

    it('should handle fetch errors during retry attempts', async () => {
      // First call fails with retryable status, second call fails with network error
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Rate limited' } })
        })
        .mockRejectedValueOnce(new Error('Network disconnected'));

      await expect(client.makeRequest('/test', {})).rejects.toThrow('Network disconnected');
    });

    it('should handle non-JSON error responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: jest.fn().mockReturnValue(null)
        },
        json: () => Promise.reject(new Error('Invalid JSON')),
        text: () => Promise.resolve('Server Error')
      });

      await expect(client.makeRequest('/test', {})).rejects.toThrow(
        'API request failed: 500 Internal Server Error.'
      );
    });

    it('should handle missing error message in JSON response', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: {
          get: jest.fn().mockReturnValue(null)
        },
        json: () => Promise.resolve({ error: {} }) // No message property
      });

      await expect(client.makeRequest('/test', {})).rejects.toThrow(
        'API request failed: 400 Bad Request.'
      );
    });

    it('should handle error response without error object', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: {
          get: jest.fn().mockReturnValue(null)
        },
        json: () => Promise.resolve({}) // No error object
      });

      await expect(client.makeRequest('/test', {})).rejects.toThrow(
        'API request failed: 403 Forbidden.'
      );
    });

    it('should handle timeout during retry sequence', async () => {
      const mockAbortController = {
        signal: { aborted: false },
        abort: jest.fn()
      };
      
      global.AbortController = jest.fn(() => mockAbortController);

      // First call triggers retry, second call times out
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Gateway error' } })
        })
        .mockRejectedValueOnce({
          name: 'AbortError',
          message: 'The operation was aborted'
        });

      await expect(client.makeRequest('/test', {}, { timeoutMs: 5000 }))
        .rejects.toThrow('Request timed out after 5000ms');
    });

    it('should use default timeout when timeoutMs is not specified', async () => {
      const mockAbortController = {
        signal: { aborted: false },
        abort: jest.fn()
      };
      
      global.AbortController = jest.fn(() => mockAbortController);

      const mockResponse = { test: 'success' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.makeRequest('/test', {});
      expect(result).toEqual(mockResponse);
    });
  });

  describe('AbortController edge cases', () => {
    it('should handle missing AbortController in environment', async () => {
      const originalAbortController = global.AbortController;
      delete global.AbortController;

      const mockResponse = { test: 'success' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.makeRequest('/test', {}, { timeoutMs: 5000 });
      expect(result).toEqual(mockResponse);

      // Restore AbortController
      global.AbortController = originalAbortController;
    });
  });

  describe('timeout calculation edge cases', () => {
    it('should handle zero timeout', async () => {
      const mockResponse = { test: 'success' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.makeRequest('/test', {}, { timeoutMs: 0 });
      expect(result).toEqual(mockResponse);
    });

    it('should handle negative timeout', async () => {
      const mockResponse = { test: 'success' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.makeRequest('/test', {}, { timeoutMs: -1000 });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('retry logic edge cases', () => {
    it('should handle maximum retries with all different error types', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Rate limited' } })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Gateway error' } })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Service down' } })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 524,
          statusText: 'Timeout',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Timeout error' } })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Still rate limited' } })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            get: jest.fn().mockReturnValue(null)
          },
          json: () => Promise.resolve({ error: { message: 'Final failure' } })
        });

      await expect(client.makeRequest('/test', {}))
        .rejects.toThrow('API request failed: 429 Too Many Requests. Final failure');

      expect(consoleSpy).toHaveBeenCalledTimes(5); // 5 retry attempts

      consoleSpy.mockRestore();
    });

    it('should handle retry-after header parsing', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            get: (name) => (name.toLowerCase() === 'retry-after') ? '5' : null
          },
          json: () => Promise.resolve({ error: { message: 'Rate limited' } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });

      const result = await client.makeRequest('/test', {});
      expect(result).toEqual({ success: true });

      // Should have used the retry-after value (5000ms + jitter)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/retrying in 5\d{3}\.\d+ms/)
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('TimeoutError', () => {
  it('should create TimeoutError with correct properties', () => {
    const error = new TimeoutError('Test timeout message');
    
    expect(error.name).toBe('TimeoutError');
    expect(error.message).toBe('Test timeout message');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof TimeoutError).toBe(true);
  });

  it('should be properly exported', () => {
    expect(TimeoutError).toBeDefined();
    expect(typeof TimeoutError).toBe('function');
  });
});
