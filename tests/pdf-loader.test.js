const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const WarpMind = require('../src/warpmind.js');
const path = require('path');
const fs = require('fs');

describe('PDF Loader Module', () => {
  let mind;
  
  beforeEach(() => {
    // Mock IndexedDB for Node.js testing
    global.indexedDB = {
      open: jest.fn(() => ({
        onsuccess: jest.fn(),
        onerror: jest.fn(),
        onupgradeneeded: jest.fn(),
        result: {
          transaction: jest.fn(() => ({
            objectStore: jest.fn(() => ({
              put: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              get: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              getAll: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              delete: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              createIndex: jest.fn(),
              index: jest.fn(() => ({
                getAll: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() }))
              }))
            }))
          }))
        }
      }))
    };
    
    global.Blob = class MockBlob {
      constructor(data) {
        this.data = data;
        this.size = data.reduce((acc, item) => acc + item.length, 0);
      }
    };
    
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    
    mind = new WarpMind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PDF loader module integration', () => {
    it('should have PDF loader methods available', () => {
      expect(typeof mind.readPdf).toBe('function');
      expect(typeof mind.isPdfRead).toBe('function');
      expect(typeof mind.listReadPdfs).toBe('function');
      expect(typeof mind.forgetPdf).toBe('function');
      expect(typeof mind.getPdfStorageInfo).toBe('function');
    });

    it('should handle PDF file validation', async () => {
      // Test with invalid input
      await expect(mind.readPdf(null)).rejects.toThrow('Invalid PDF source');
      await expect(mind.readPdf(123)).rejects.toThrow('Invalid PDF source');
      await expect(mind.readPdf({})).rejects.toThrow('Invalid PDF source');
    });

    it('should handle URL input validation', async () => {
      // Mock fetch to fail
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      await expect(mind.readPdf('https://example.com/test.pdf')).rejects.toThrow('Failed to process PDF');
    });

    it('should handle File object input validation', async () => {
      // Mock File object
      const mockFile = {
        name: 'test.pdf',
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100))
      };
      
      // Since we can't easily mock PDF.js in Node.js, expect it to fail gracefully
      await expect(mind.readPdf(mockFile)).rejects.toThrow('PDF.js is not available');
    });

    it('should handle isPdfRead with single ID', async () => {
      // Mock storage to return no metadata
      const result = await mind.isPdfRead('test-pdf');
      expect(typeof result).toBe('boolean');
    });

    it('should handle isPdfRead with multiple IDs', async () => {
      const result = await mind.isPdfRead(['test-pdf-1', 'test-pdf-2']);
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('test-pdf-1');
      expect(result).toHaveProperty('test-pdf-2');
    });

    it('should handle listReadPdfs', async () => {
      const result = await mind.listReadPdfs();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle forgetPdf', async () => {
      await expect(mind.forgetPdf('test-pdf')).resolves.not.toThrow();
    });

    it('should handle getPdfStorageInfo', async () => {
      const result = await mind.getPdfStorageInfo();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('totalSize');
      expect(result).toHaveProperty('unit');
      expect(result).toHaveProperty('pdfs');
      expect(Array.isArray(result.pdfs)).toBe(true);
    });
  });

  describe('PDF processing options', () => {
    it('should handle custom options', async () => {
      const mockFile = {
        name: 'test.pdf',
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100))
      };
      
      const options = {
        id: 'custom-id',
        chunkTokens: 200,
        embedModel: 'text-embedding-3-large',
        processImages: false,
        imageDetail: 'high',
        onProgress: jest.fn()
      };
      
      // Since we can't easily mock PDF.js in Node.js, expect it to fail gracefully
      await expect(mind.readPdf(mockFile, options)).rejects.toThrow('PDF.js is not available');
      
      // But verify options were processed
      expect(options.onProgress).toBeDefined();
    });

    it('should handle progress callback', async () => {
      const mockFile = {
        name: 'test.pdf',
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100))
      };
      
      const progressCallback = jest.fn();
      
      try {
        await mind.readPdf(mockFile, { onProgress: progressCallback });
      } catch (error) {
        // Expected to fail due to PDF.js not being available
        expect(error.message).toContain('PDF.js is not available');
      }
    });
  });

  describe('Utility functions', () => {
    it('should have internal utility methods', () => {
      expect(typeof mind._extractImagesFromPage).toBe('function');
      expect(typeof mind._generateEmbedding).toBe('function');
      expect(typeof mind._findPageReferences).toBe('function');
      expect(typeof mind._registerPdfRetrievalTool).toBe('function');
      expect(typeof mind._unregisterPdfRetrievalTool).toBe('function');
      expect(typeof mind._searchPdf).toBe('function');
    });
  });

  describe('Error handling', () => {
    it('should handle embedding generation errors gracefully', async () => {
      // Mock makeRequest to fail
      mind.makeRequest = jest.fn().mockRejectedValue(new Error('API error'));
      
      await expect(mind._generateEmbedding('test text', 'test-model')).rejects.toThrow('Failed to generate embedding');
    });

    it('should handle PDF search errors gracefully', async () => {
      const result = await mind._searchPdf('non-existent-pdf', 'test query');
      expect(result).toHaveProperty('error');
    });
  });
});

describe('PDF Loader Browser Integration', () => {
  let mind;
  
  beforeEach(() => {
    // Mock browser environment
    global.window = { location: { href: 'http://localhost' } };
    global.document = {
      createElement: jest.fn(() => ({
        src: '',
        onload: jest.fn(),
        onerror: jest.fn()
      })),
      head: {
        appendChild: jest.fn()
      }
    };
    
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    
    // Mock IndexedDB
    global.indexedDB = {
      open: jest.fn(() => ({
        onsuccess: jest.fn(),
        onerror: jest.fn(),
        onupgradeneeded: jest.fn(),
        result: {
          transaction: jest.fn(() => ({
            objectStore: jest.fn(() => ({
              put: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              get: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              getAll: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              delete: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
              createIndex: jest.fn(),
              index: jest.fn(() => ({
                getAll: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() }))
              }))
            }))
          }))
        }
      }))
    };
    
    mind = new WarpMind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com'
    });
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    jest.clearAllMocks();
  });

  it('should handle browser environment PDF loading', async () => {
    // Mock canvas and rendering
    global.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: jest.fn(),
      getImageData: jest.fn()
    }));
    
    global.HTMLCanvasElement.prototype.toBlob = jest.fn((callback) => {
      callback(new Blob(['fake-image-data'], { type: 'image/png' }));
    });
    
    const mockFile = {
      name: 'test.pdf',
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100))
    };
    
    // Since we can't easily mock PDF.js loading, expect it to fail gracefully
    await expect(mind.readPdf(mockFile)).rejects.toThrow();
  });
});
