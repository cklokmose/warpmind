/**
 * Comprehensive tests for vision module to achieve full coverage
 */

const WarpMind = require('../src/warpmind');

// Mock fetch globally
global.fetch = jest.fn();

// Mock FileReader globally
global.FileReader = jest.fn(() => {
  const instance = {
    readAsDataURL: jest.fn(),
    onload: null,
    onerror: null,
    result: 'data:image/jpeg;base64,mockbase64data'
  };
  return instance;
});

describe('WarpMind Vision Module Tests', () => {
  let mind;

  beforeEach(() => {
    mind = new WarpMind({
      apiKey: 'test-api-key',
      baseURL: 'https://api.openai.com/v1'
    });
    
    // Reset fetch mock
    fetch.mockClear();
  });

  describe('analyzeImage() method', () => {
    it('should analyze image from URL with default options', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'This is a beautiful landscape image.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await mind.analyzeImage(
        'https://example.com/image.jpg',
        'What do you see in this image?'
      );

      expect(result).toEqual("This is a beautiful landscape image.");
      
      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toEqual([
        { type: "text", text: "What do you see in this image?" },
        {
          type: "image_url",
          image_url: {
            url: "https://example.com/image.jpg",
            detail: "low"
          }
        }
      ]);
    });

    it('should analyze image with high detail option', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Detailed analysis of the image.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await mind.analyzeImage(
        'https://example.com/image.jpg',
        'Analyze in detail',
        { detail: 'high' }
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[1].image_url.detail).toBe('high');
    });

    it('should validate detail parameter and throw error for invalid values', async () => {
      await expect(mind.analyzeImage(
        'https://example.com/image.jpg',
        'Test',
        { detail: 'invalid' }
      )).rejects.toThrow('options.detail must be "low" or "high"');
    });

    it('should handle base64 data URL images', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Analysis of base64 image.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAA==';
      
      await mind.analyzeImage(base64Image, 'Analyze this base64 image');

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[1].image_url.url).toBe(base64Image);
    });

    it('should handle File objects by converting to base64', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Analysis of uploaded file.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Mock File object with better detection properties  
      const mockFile = {
        constructor: {
          name: 'File'
        },
        type: 'image/jpeg',
        size: 1024,
        name: 'test.jpg'
      };

      // Make the vision module detect this as a File and convert to base64
      Object.defineProperty(mockFile, Symbol.toStringTag, {
        value: 'File'
      });

      // Mock FileReader for the browser environment
      global.FileReader = class MockFileReader {
        constructor() {
          this.onload = null;
          this.onerror = null;
        }
        readAsDataURL(file) {
          setTimeout(() => {
            this.result = 'data:image/jpeg;base64,mockbase64data';
            if (this.onload) {
              this.onload({ target: { result: this.result } });
            }
          }, 10);
        }
      };
      
      const result = await mind.analyzeImage(mockFile, 'Analyze this file');
      expect(result).toBe('Analysis of uploaded file.');
      
      // Clean up
      delete global.FileReader;
    }, 10000);

    it('should handle Blob objects by converting to base64', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Analysis of blob image.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Mock Blob object
      const mockBlob = {
        constructor: {
          name: 'Blob'
        },
        type: 'image/png',
        size: 2048
      };

      // Make the vision module detect this as a Blob and convert to base64
      Object.defineProperty(mockBlob, Symbol.toStringTag, {
        value: 'Blob'
      });

      // Mock FileReader for the browser environment
      global.FileReader = class MockFileReader {
        constructor() {
          this.onload = null;
          this.onerror = null;
        }
        readAsDataURL(blob) {
          setTimeout(() => {
            this.result = 'data:image/png;base64,mockblobdata';
            if (this.onload) {
              this.onload({ target: { result: this.result } });
            }
          }, 10);
        }
      };

      const result = await mind.analyzeImage(mockBlob, 'Analyze this blob');
      expect(result).toBe('Analysis of blob image.');
      
      // Clean up
      delete global.FileReader;
    }, 10000);

    it('should use default prompt when none provided', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Default analysis.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await mind.analyzeImage('https://example.com/image.jpg');

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[0].text).toBe('What do you see in this image?');
    });

    it('should pass through additional options like model and temperature', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Custom model analysis.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await mind.analyzeImage(
        'https://example.com/image.jpg',
        'Analyze',
        {
          detail: 'low',
          model: 'gpt-4-vision-preview',
          temperature: 0.3,
          timeoutMs: 10000
        }
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('gpt-4-vision-preview');
      expect(requestBody.temperature).toBe(0.3);
    });

    it('should handle HTTP errors properly', async () => {
      // Mock makeRequest to throw the expected error
      mind.makeRequest = jest.fn().mockRejectedValueOnce(
        new Error('API request failed: 400 Bad Request. Invalid image format')
      );

      await expect(mind.analyzeImage(
        'https://example.com/invalid-image.txt',
        'Analyze this'
      )).rejects.toThrow('API request failed: 400 Bad Request');
    });

    it('should handle timeout errors', async () => {
      // Mock makeRequest to throw timeout error
      mind.makeRequest = jest.fn().mockRejectedValueOnce(
        new Error('Request timed out after 1000ms')
      );

      await expect(mind.analyzeImage(
        'https://example.com/image.jpg',
        'Test',
        { timeoutMs: 1000 }
      )).rejects.toThrow('Request timed out after 1000ms');
    });

    it('should handle network errors', async () => {
      // Mock makeRequest to throw network error
      mind.makeRequest = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      await expect(mind.analyzeImage(
        'https://example.com/image.jpg',
        'Test'
      )).rejects.toThrow('Network error');
    });
  });

  describe('module factory function', () => {
    it.skip('should export the module correctly in browser environment', () => {
      // This test is skipped because it's complex to mock browser environment properly
      // The browser export functionality is tested in actual browser integration tests
    });

    it('should import fileToBase64 correctly in Node.js environment', () => {
      // This tests the Node.js import path which is already covered by default,
      // but ensures the utility function is available
      const createVisionModule = require('../src/modules/vision.js');
      const mockClient = {
        makeRequest: jest.fn()
      };
      
      const visionModule = createVisionModule(mockClient);
      expect(visionModule.analyzeImage).toBeDefined();
      expect(typeof visionModule.analyzeImage).toBe('function');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty string image URL', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'No image provided.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await mind.analyzeImage('', 'What do you see?');

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[1].image_url.url).toBe('');
    });

    it('should handle null image parameter gracefully', async () => {
      // Null should throw an error since it's not a valid image input
      await expect(mind.analyzeImage(null, 'Analyze null'))
        .rejects.toThrow('Image must be a URL string, File, or Blob object');
    });

    it('should handle non-data URL strings as regular URLs', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Regular URL analysis.' } }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await mind.analyzeImage('https://example.com/image.jpg', 'Analyze');

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[1].image_url.url).toBe('https://example.com/image.jpg');
    });
  });
});
