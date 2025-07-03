/**
 * Comprehensive tests for util.js to achieve full coverage
 */

const {
  addJitter,
  calculateRetryDelay,
  shouldRetry,
  createTimeoutController,
  sleep,
  delayForRetry,
  fileToBase64
} = require('../src/util');

// Mock AbortController globally
global.AbortController = jest.fn(() => ({
  signal: {},
  abort: jest.fn()
}));

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

// Mock global objects for browser environment testing
const mockFileReader = {
  readAsDataURL: jest.fn(),
  result: 'data:image/jpeg;base64,mockbase64data',
  onload: null,
  onerror: null
};

describe('Utility Functions Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addJitter', () => {
    it('should add random jitter between 0 and 250ms', () => {
      const delay = 1000;
      const jitteredDelay = addJitter(delay);
      
      expect(jitteredDelay).toBeGreaterThanOrEqual(delay);
      expect(jitteredDelay).toBeLessThan(delay + 250);
    });

    it('should handle zero delay', () => {
      const jitteredDelay = addJitter(0);
      expect(jitteredDelay).toBeGreaterThanOrEqual(0);
      expect(jitteredDelay).toBeLessThan(250);
    });

    it('should handle negative delay', () => {
      const jitteredDelay = addJitter(-100);
      expect(jitteredDelay).toBeGreaterThanOrEqual(-100);
      expect(jitteredDelay).toBeLessThan(150); // -100 + 250
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateRetryDelay(0)).toBeGreaterThanOrEqual(500);
      expect(calculateRetryDelay(0)).toBeLessThan(750); // 500 + 250 jitter
      
      expect(calculateRetryDelay(1)).toBeGreaterThanOrEqual(1000);
      expect(calculateRetryDelay(1)).toBeLessThan(1250); // 1000 + 250 jitter
      
      expect(calculateRetryDelay(2)).toBeGreaterThanOrEqual(2000);
      expect(calculateRetryDelay(2)).toBeLessThan(2250); // 2000 + 250 jitter
    });

    it('should respect retry-after header when provided', () => {
      const retryAfter = '3'; // 3 seconds as string (as it would come from HTTP header)
      const delay = calculateRetryDelay(1, retryAfter);
      
      expect(delay).toBeGreaterThanOrEqual(3000); // 3 seconds in ms
      expect(delay).toBeLessThan(3250); // 3000 + max jitter
    });

    it('should handle large attempt numbers', () => {
      const delay = calculateRetryDelay(10);
      expect(delay).toBeGreaterThanOrEqual(500 * Math.pow(2, 10));
      expect(delay).toBeLessThan(500 * Math.pow(2, 10) + 250);
    });
  });

  describe('shouldRetry', () => {
    it('should return true for retryable status codes', () => {
      expect(shouldRetry(429)).toBe(true);
      expect(shouldRetry(502)).toBe(true);
      expect(shouldRetry(503)).toBe(true);
      expect(shouldRetry(524)).toBe(true);
    });

    it('should return false for non-retryable status codes', () => {
      expect(shouldRetry(200)).toBe(false);
      expect(shouldRetry(400)).toBe(false);
      expect(shouldRetry(401)).toBe(false);
      expect(shouldRetry(403)).toBe(false);
      expect(shouldRetry(404)).toBe(false);
      expect(shouldRetry(500)).toBe(false);
      expect(shouldRetry(501)).toBe(false);
    });

    it('should handle edge case status codes', () => {
      expect(shouldRetry(0)).toBe(false);
      expect(shouldRetry(999)).toBe(false);
      expect(shouldRetry(-1)).toBe(false);
    });
  });

  describe('createTimeoutController', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should create AbortController and timeout', () => {
      const mockAbortController = {
        signal: { aborted: false },
        abort: jest.fn()
      };
      
      global.AbortController = jest.fn(() => mockAbortController);
      
      const { controller, timeoutId } = createTimeoutController(5000);
      
      expect(controller).toBe(mockAbortController);
      expect(timeoutId).toBeDefined();
      expect(typeof timeoutId).toBe('object'); // setTimeout returns a timer object in Jest
    });

    it('should abort controller when timeout triggers', () => {
      const mockAbortController = {
        signal: { aborted: false },
        abort: jest.fn()
      };
      
      global.AbortController = jest.fn(() => mockAbortController);
      
      const { controller } = createTimeoutController(1000);
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(1000);
      
      expect(controller.abort).toHaveBeenCalled();
    });

    it('should handle missing AbortController gracefully', () => {
      const originalAbortController = global.AbortController;
      delete global.AbortController;
      
      const { controller, timeoutId } = createTimeoutController(5000);
      
      expect(controller).toBeNull();
      expect(timeoutId).toBeDefined();
      
      global.AbortController = originalAbortController;
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve after specified delay', async () => {
      const sleepPromise = sleep(1000);
      
      jest.advanceTimersByTime(999);
      // Promise should not be resolved yet
      let resolved = false;
      sleepPromise.then(() => { resolved = true; });
      
      await Promise.resolve(); // Allow promise to settle
      expect(resolved).toBe(false);
      
      jest.advanceTimersByTime(1);
      await sleepPromise;
      expect(resolved).toBe(true);
    });

    it('should handle zero delay', async () => {
      const sleepPromise = sleep(0);
      jest.advanceTimersByTime(0);
      await sleepPromise;
      // Should complete without error
    });

    it('should handle negative delay', async () => {
      const sleepPromise = sleep(-100);
      jest.advanceTimersByTime(0);
      await sleepPromise;
      // Should complete without error
    });
  });

  describe('delayForRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delay for calculated retry time', async () => {
      const delayPromise = delayForRetry(1); // Should be ~1000ms + jitter
      
      jest.advanceTimersByTime(999);
      let resolved = false;
      delayPromise.then(() => { resolved = true; });
      
      await Promise.resolve();
      expect(resolved).toBe(false);
      
      jest.advanceTimersByTime(300); // Account for jitter
      await delayPromise;
      expect(resolved).toBe(true);
    });

    it('should use retry-after header when provided', async () => {
      // Mock Math.random to control jitter BEFORE calling delayForRetry
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.5); // Fixed jitter value
      
      const retryAfter = '2'; // 2 seconds as string
      const delayPromise = delayForRetry(0, retryAfter);
      
      jest.advanceTimersByTime(1999);
      let resolved = false;
      delayPromise.then(() => { resolved = true; });
      
      await Promise.resolve();
      expect(resolved).toBe(false);
      
      jest.advanceTimersByTime(300); // Account for jitter
      await delayPromise;
      
      // Restore Math.random
      Math.random = originalRandom;
      
      expect(resolved).toBe(true);
    });
  });

  describe('fileToBase64', () => {
    it('should convert file to base64 in browser environment', async () => {
      // Mock browser environment
      global.FileReader = jest.fn(() => mockFileReader);
      
      const mockFile = new Blob(['test'], { type: 'image/jpeg' });
      
      // Set up FileReader mock to call onload after readAsDataURL
      mockFileReader.readAsDataURL.mockImplementation(function(file) {
        setTimeout(() => {
          this.onload();
        }, 0);
      });
      
      const result = await fileToBase64(mockFile);
      
      expect(result).toBe('data:image/jpeg;base64,mockbase64data');
      expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(mockFile);
    });

    it('should handle FileReader errors in browser', async () => {
      global.FileReader = jest.fn(() => mockFileReader);
      
      const mockFile = new Blob(['test'], { type: 'image/jpeg' });
      
      mockFileReader.readAsDataURL.mockImplementation(function(file) {
        setTimeout(() => {
          this.onerror(new Error('File read error'));
        }, 0);
      });
      
      await expect(fileToBase64(mockFile)).rejects.toThrow('Failed to read file');
    });

    it('should use Node.js fs methods when FileReader is not available', async () => {
      // Remove FileReader to simulate Node.js environment
      const originalFileReader = global.FileReader;
      delete global.FileReader;
      
      // Mock fs.readFileSync
      const mockReadFileSync = jest.fn().mockReturnValue(Buffer.from('test data'));
      jest.doMock('fs', () => ({
        readFileSync: mockReadFileSync
      }));
      
      // Re-require the module to get the Node.js version
      delete require.cache[require.resolve('../src/util.js')];
      const { fileToBase64: nodeFileToBase64 } = require('../src/util.js');
      
      const mockFile = { path: '/test/image.jpg', type: 'image/jpeg' };
      const result = await nodeFileToBase64(mockFile);
      
      expect(result).toBe('data:image/jpeg;base64,dGVzdCBkYXRh'); // base64 of 'test data'
      expect(mockReadFileSync).toHaveBeenCalledWith('/test/image.jpg');
      
      // Restore environment
      global.FileReader = originalFileReader;
      jest.unmock('fs');
    });

    it('should handle files without type property', async () => {
      global.FileReader = jest.fn(() => mockFileReader);
      
      const mockFile = new Blob(['test']); // No type specified
      
      mockFileReader.readAsDataURL.mockImplementation(function(file) {
        setTimeout(() => {
          this.result = 'data:application/octet-stream;base64,mockdata';
          this.onload();
        }, 0);
      });
      
      const result = await fileToBase64(mockFile);
      
      expect(result).toBe('data:application/octet-stream;base64,mockdata');
    });

    it('should handle null or undefined files', async () => {
      await expect(fileToBase64(null)).rejects.toThrow();
      await expect(fileToBase64(undefined)).rejects.toThrow();
    });

    it('should use fallback MIME type in Node.js when type is not available', async () => {
      const originalFileReader = global.FileReader;
      delete global.FileReader;
      
      const mockReadFileSync = jest.fn().mockReturnValue(Buffer.from('test data'));
      jest.doMock('fs', () => ({
        readFileSync: mockReadFileSync
      }));
      
      delete require.cache[require.resolve('../src/util.js')];
      const { fileToBase64: nodeFileToBase64 } = require('../src/util.js');
      
      const mockFile = { path: '/test/unknown-file' }; // No type property
      const result = await nodeFileToBase64(mockFile);
      
      expect(result).toBe('data:application/octet-stream;base64,dGVzdCBkYXRh');
      
      global.FileReader = originalFileReader;
      jest.unmock('fs');
    });
  });

  describe('module exports', () => {
    it('should export all utility functions', () => {
      const utils = require('../src/util.js');
      
      expect(utils.addJitter).toBeDefined();
      expect(utils.calculateRetryDelay).toBeDefined();
      expect(utils.shouldRetry).toBeDefined();
      expect(utils.createTimeoutController).toBeDefined();
      expect(utils.sleep).toBeDefined();
      expect(utils.delayForRetry).toBeDefined();
      expect(utils.fileToBase64).toBeDefined();
    });

    it.skip('should export to window object in browser environment', () => {
      // This test is skipped because it's complex to mock browser environment properly
      // The browser export functionality is tested in actual browser integration tests
    });
  });
});
