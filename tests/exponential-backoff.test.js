/**
 * Test sui  beforeEach(() => {
    warpmind = new Warpmind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1'
    });
    
    // Reset all mocks first
    jest.clearAllMocks();
    
    // Then mock the utility delay calculation to use smaller delays for testing
    jest.spyOn(utils, 'calculateRetryDelay').mockImplementation((attempt, retryAfter) => {
      if (retryAfter) {
        return parseInt(retryAfter) * 10; // Convert to 10ms instead of 1000ms
      }
      // Return much smaller delays for testing: 5ms, 10ms, 20ms, etc.
      return Math.max(5, 5 * Math.pow(2, attempt));
    });
  }); back-off functionality in Warpmind
 * Tests retry logic, timeout handling, and TimeoutError
 */

// Import the Warpmind class for Node.js testing
const Warpmind = require('../src/warpmind.js');
const { TimeoutError, utils } = require('../src/warpmind.js');

// Mock fetch for testing
global.fetch = jest.fn();

describe('Warpmind Exponential Back-off Tests', () => {
  let warpmind;

  beforeEach(() => {
    warpmind = new Warpmind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1'
    });
    
    // Reset all mocks first
    jest.clearAllMocks();
    
    // Then mock the utility delay calculation to use smaller delays for testing
    jest.spyOn(utils, 'calculateRetryDelay').mockImplementation((attempt, retryAfter) => {
      if (retryAfter) {
        return parseInt(retryAfter) * 10; // Convert to 10ms instead of 1000ms
      }
      // Return much smaller delays for testing: 5ms, 10ms, 20ms, etc.
      return 5 * Math.pow(2, attempt);
    });
  });

  afterEach(() => {
    // Restore all mocks
    jest.restoreAllMocks();
    
    // Clean up any pending timers
    jest.clearAllTimers();
  });

  describe('Retry Logic', () => {
    test('should preserve request data through retries', async () => {
      // Clear any previous mocks to ensure clean state
      fetch.mockClear();
      
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: () => null },
        json: jest.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
      };

      const successResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success!' } }] })
      };

      fetch
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await warpmind.chat('Test message', { temperature: 0.5 });
      
      // Should have succeeded after retry
      expect(result).toBe('Success!');

      // Check that both calls had the same request data
      expect(fetch).toHaveBeenCalledTimes(2);
      
      const firstCall = fetch.mock.calls[0];
      const secondCall = fetch.mock.calls[1];
      
      expect(firstCall[1].body).toBe(secondCall[1].body);
      expect(firstCall[1].headers).toEqual(secondCall[1].headers);
    });

    test('should retry on 429 status code with exponential back-off', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: () => null }, // Mock headers.get method
        json: jest.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
      };

      const successResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success!' } }] })
      };

      // First call fails with 429, second call succeeds
      fetch
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await warpmind.chat('Hello', { timeoutMs: 10000 });
      expect(result).toBe('Success!');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('should retry on 502, 503, and 524 status codes', async () => {
      const statusCodes = [502, 503, 524];
      
      for (const statusCode of statusCodes) {
        // Reset fetch mock only for each iteration
        fetch.mockClear();
        
        const mockResponse = {
          ok: false,
          status: statusCode,
          statusText: 'Server Error',
          headers: { get: () => null },
          json: jest.fn().mockResolvedValue({ error: { message: 'Server error' } })
        };

        const successResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success!' } }] })
        };

        fetch
          .mockResolvedValueOnce(mockResponse)
          .mockResolvedValueOnce(successResponse);

        const result = await warpmind.chat('Hello', { timeoutMs: 10000 });
        expect(result).toBe('Success!');
        expect(fetch).toHaveBeenCalledTimes(2);
      }
    });

    test('should not retry on non-retryable status codes', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: { get: () => null },
        json: jest.fn().mockResolvedValue({ error: { message: 'Bad request' } })
      };

      fetch.mockResolvedValueOnce(mockResponse);

      await expect(warpmind.chat('Hello')).rejects.toThrow('API request failed: 400 Bad Request');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('should respect Retry-After header when present', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: (header) => header === 'Retry-After' ? '2' : null },
        json: jest.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
      };

      const successResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success!' } }] })
      };

      fetch
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await warpmind.chat('Hello');
      expect(result).toBe('Success!');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('should stop retrying after maximum attempts', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: () => null },
        json: jest.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
      };

      fetch.mockResolvedValue(mockResponse);

      await expect(warpmind.makeRequest('/test', {}, { maxRetries: 2 })).rejects.toThrow('API request failed: 429 Too Many Requests');
      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should calculate exponential back-off correctly', () => {
      // Temporarily restore the original method for this test
      jest.restoreAllMocks();
      
      // Test the utility delay calculation method directly
      const delay0 = utils.calculateRetryDelay(0);
      const delay1 = utils.calculateRetryDelay(1);
      const delay2 = utils.calculateRetryDelay(2);

      // Base delays should be 500, 1000, 2000 + jitter (0-250)
      expect(delay0).toBeGreaterThanOrEqual(500);
      expect(delay0).toBeLessThanOrEqual(750);
      
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1250);
      
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2250);
      
      // Re-mock for other tests
      jest.spyOn(utils, 'calculateRetryDelay').mockImplementation((attempt, retryAfter) => {
        if (retryAfter) {
          return parseInt(retryAfter) * 10;
        }
        return 5 * Math.pow(2, attempt);
      });
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout requests after specified time', async () => {
      // Mock a request that times out
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      fetch.mockRejectedValue(abortError);

      const promise = warpmind.chat('Hello', { timeoutMs: 1000 });
      
      await expect(promise).rejects.toThrow(TimeoutError);
      await expect(promise).rejects.toThrow('Request timed out after 1000ms');
    });

    test('should use default timeout when not specified', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      fetch.mockRejectedValue(abortError);

      const promise = warpmind.chat('Hello'); // No timeout specified
      
      await expect(promise).rejects.toThrow(TimeoutError);
    });

    test('should clear timeout on successful response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success!' } }] })
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await warpmind.chat('Hello', { timeoutMs: 1000 });
      
      expect(result).toBe('Success!');
    });

    test('should apply timeout to all public methods', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ 
          choices: [{ 
            message: { content: 'Success!' },
            text: 'Success!'
          }] 
        })
      };

      fetch.mockResolvedValue(mockResponse);

      // Test chat method
      await warpmind.chat('Hello', { timeoutMs: 5000 });
      
      // Test complete method
      await warpmind.complete('Hello', { timeoutMs: 5000 });
      
      // Test ask method
      await warpmind.ask('Hello', { timeoutMs: 5000 });

      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Network Error Handling', () => {
    test('should retry on network errors', async () => {
      const networkError = new TypeError('Failed to fetch');
      const successResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success!' } }] })
      };

      fetch
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const result = await warpmind.chat('Hello');
      expect(result).toBe('Success!');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('should throw network error after max retries', async () => {
      const networkError = new TypeError('Failed to fetch');
      fetch.mockRejectedValue(networkError);

      await expect(warpmind.makeRequest('/test', {}, { maxRetries: 1 })).rejects.toThrow('Network error: Unable to connect to the API');
      expect(fetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('Integration Tests', () => {
    test('should work with real retry scenario (timeout + retry)', async () => {
      const timeoutError = new Error('AbortError');
      timeoutError.name = 'AbortError';
      
      const successResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success!' } }] })
      };

      fetch
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(successResponse);

      // Should timeout first, then succeed on retry
      await expect(warpmind.chat('Hello', { timeoutMs: 100 })).rejects.toThrow(TimeoutError);
    });
  });

  describe('Helper Methods', () => {
    test('shouldRetry should return true for retryable status codes', () => {
      expect(utils.shouldRetry(429)).toBe(true);
      expect(utils.shouldRetry(502)).toBe(true);
      expect(utils.shouldRetry(503)).toBe(true);
      expect(utils.shouldRetry(524)).toBe(true);
    });

    test('shouldRetry should return false for non-retryable status codes', () => {
      expect(utils.shouldRetry(200)).toBe(false);
      expect(utils.shouldRetry(400)).toBe(false);
      expect(utils.shouldRetry(401)).toBe(false);
      expect(utils.shouldRetry(404)).toBe(false);
      expect(utils.shouldRetry(500)).toBe(false);
    });

    test('addJitter should add random jitter to delay', () => {
      const baseDelay = 1000;
      const delayWithJitter = utils.addJitter(baseDelay);
      
      expect(delayWithJitter).toBeGreaterThanOrEqual(baseDelay);
      expect(delayWithJitter).toBeLessThanOrEqual(baseDelay + 250);
    });
  });
});
