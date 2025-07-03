/**
 * Comprehensive tests for data processing module to achieve full coverage
 */

const Warpmind = require('../src/warpmind');

// Mock fetch globally
global.fetch = jest.fn();

describe('Warpmind Data Processing Module Tests', () => {
  let mind;

  beforeEach(() => {
    mind = new Warpmind({
      apiKey: 'test-api-key',
      baseURL: 'https://api.openai.com/v1'
    });
    
    // Reset fetch mock
    fetch.mockClear();
  });

  describe('process() method', () => {
    it('should process data with valid JSON response and schema validation', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"name": "John", "age": 30}' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await mind.process(
        "Analyze this person data",
        { firstName: "John", lastName: "Doe", years: 30 },
        { name: "Full name", age: "Age in years" }
      );

      expect(result).toEqual({ name: "John", age: 30 });
      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': 'test-api-key'
          },
          body: expect.stringContaining('"response_format":{"type":"json_object"}')
        })
      );
    });

    it('should process string data correctly', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"summary": "test data"}' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await mind.process(
        "Summarize this text",
        "This is a test string",
        { summary: "Summary of the text" }
      );

      expect(result).toEqual({ summary: "test data" });
    });

    it('should process without data parameter', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"result": "no data"}' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await mind.process(
        "Generate random data",
        null,
        { result: "Generated result" }
      );

      expect(result).toEqual({ result: "no data" });
    });

    it('should process without schema (empty schema)', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"anything": "goes"}' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await mind.process(
        "Generate JSON",
        null,
        {} // Empty schema
      );

      expect(result).toEqual({ anything: "goes" });
    });

    it('should handle JSON parsing errors with retries', async () => {
      const invalidJsonResponse = {
        choices: [{ message: { content: 'This is not valid JSON' } }]
      };
      
      const validJsonResponse = {
        choices: [{ message: { content: '{"success": true}' } }]
      };

      // First call returns invalid JSON, second call returns valid JSON
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(invalidJsonResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validJsonResponse)
        });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await mind.process(
        "Generate JSON",
        null,
        { success: "Boolean result" },
        { retries: 1 }
      );

      expect(result).toEqual({ success: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Process attempt 1 failed:')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle schema validation errors with retries', async () => {
      const incompleteResponse = {
        choices: [{ message: { content: '{"name": "John"}' } }] // Missing "age" field
      };
      
      const completeResponse = {
        choices: [{ message: { content: '{"name": "John", "age": 30}' } }]
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(incompleteResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(completeResponse)
        });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await mind.process(
        "Create person data",
        null,
        { name: "Person name", age: "Person age" },
        { retries: 1 }
      );

      expect(result).toEqual({ name: "John", age: 30 });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Process attempt 1 failed:')
      );
      
      consoleSpy.mockRestore();
    });

    it('should fail after maximum retries with proper error logging', async () => {
      const invalidResponse = {
        choices: [{ message: { content: 'Invalid JSON' } }]
      };

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidResponse)
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(mind.process(
        "Generate JSON",
        null,
        { field: "description" },
        { retries: 1 }
      )).rejects.toThrow('Response validation failed');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2); // Two failed attempts
      expect(consoleErrorSpy).toHaveBeenCalledWith('All process attempts failed.');
      
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should handle HTTP errors properly', async () => {
      // Mock chat method to simulate HTTP error that gets processed properly
      mind.chat = jest.fn()
        .mockRejectedValueOnce(new Error('API request failed: 500 Internal Server Error. Server error'))
        .mockRejectedValueOnce(new Error('API request failed: 500 Internal Server Error. Server error'))
        .mockRejectedValueOnce(new Error('API request failed: 500 Internal Server Error. Server error'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(mind.process(
        "Test prompt",
        null,
        { result: "test" }
      )).rejects.toThrow(/API request failed: 500 Internal Server Error|All process attempts failed/);

      consoleSpy.mockRestore();
    });

    it('should pass additional options to the chat method', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"test": "value"}' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await mind.process(
        "Test",
        null,
        { test: "field" },
        { 
          retries: 0,
          temperature: 0.7,
          model: 'gpt-4',
          timeoutMs: 5000
        }
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.model).toBe('gpt-4');
    });

    it('should handle array data input', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"count": 3}' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const arrayData = [{ name: "item1" }, { name: "item2" }, { name: "item3" }];
      
      await mind.process(
        "Count items",
        arrayData,
        { count: "Number of items" }
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain(JSON.stringify(arrayData, null, 2));
    });

    it('should handle object data input', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"processed": true}' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const objectData = { name: "test", value: 42 };
      
      await mind.process(
        "Process object",
        objectData,
        { processed: "Whether processing succeeded" }
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain(JSON.stringify(objectData, null, 2));
    });

    it('should include retry delay between attempts', async () => {
      const invalidResponse = {
        choices: [{ message: { content: 'Not JSON' } }]
      };

      const validResponse = {
        choices: [{ message: { content: '{"success": true}' } }]
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(invalidResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validResponse)
        });

      const startTime = Date.now();
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await mind.process(
        "Test",
        null,
        { success: "result" },
        { retries: 1 }
      );

      const endTime = Date.now();
      
      // Should have waited at least 500ms for the retry delay
      expect(endTime - startTime).toBeGreaterThan(450);
      
      consoleSpy.mockRestore();
    });
  });

  describe('module factory function', () => {
    it.skip('should export the module correctly in browser environment', () => {
      // This test is skipped because it's complex to mock browser environment properly
      // The browser export functionality is tested in actual browser integration tests
    });
  });
});
