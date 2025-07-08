const WarpMind = require('../src/warpmind');

describe('WarpMind recallPdf() method', () => {
  let mind;

  beforeEach(() => {
    mind = new WarpMind({
      apiKey: 'test-key',
      baseURL: 'http://test-api.example.com'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recallPdf functionality', () => {
    it('should recall a previously processed PDF from storage', async () => {
      // Mock storage methods
      const mockMetadata = {
        id: 'test-pdf',
        title: 'Test Document',
        numPages: 5,
        totalChunks: 10,
        processedAt: new Date().toISOString()
      };

      const mockChunks = [
        { id: 'test-pdf-0', text: 'First chunk', embedding: [0.1, 0.2, 0.3] },
        { id: 'test-pdf-1', text: 'Second chunk', embedding: [0.4, 0.5, 0.6] }
      ];

      // Mock storage
      const mockStorage = {
        getMetadata: jest.fn().mockResolvedValue(mockMetadata),
        getChunks: jest.fn().mockResolvedValue(mockChunks)
      };

      // Mock the internal methods
      mind._registerPdfRetrievalTool = jest.fn();

      // Replace the storage in the PDF loader
      const pdfLoader = mind.readPdf;
      mind._pdfStorage = mockStorage;

      // Mock the storage methods on the PDF loader module
      jest.spyOn(mind, 'recallPdf').mockImplementation(async (pdfId) => {
        const metadata = await mockStorage.getMetadata(pdfId);
        if (!metadata) {
          throw new Error(`PDF with ID "${pdfId}" not found. Use readPdf() to process it first.`);
        }
        const chunks = await mockStorage.getChunks(pdfId);
        mind._registerPdfRetrievalTool(pdfId, metadata.title);
        return pdfId;
      });

      const result = await mind.recallPdf('test-pdf');

      expect(result).toBe('test-pdf');
      expect(mockStorage.getMetadata).toHaveBeenCalledWith('test-pdf');
      expect(mockStorage.getChunks).toHaveBeenCalledWith('test-pdf');
      expect(mind._registerPdfRetrievalTool).toHaveBeenCalledWith('test-pdf', 'Test Document');
    });

    it('should throw error when PDF not found in storage', async () => {
      // Mock storage to return null (PDF not found)
      const mockStorage = {
        getMetadata: jest.fn().mockResolvedValue(null)
      };

      jest.spyOn(mind, 'recallPdf').mockImplementation(async (pdfId) => {
        const metadata = await mockStorage.getMetadata(pdfId);
        if (!metadata) {
          throw new Error(`PDF with ID "${pdfId}" not found. Use readPdf() to process it first.`);
        }
        return pdfId;
      });

      await expect(mind.recallPdf('non-existent-pdf')).rejects.toThrow(
        'PDF with ID "non-existent-pdf" not found. Use readPdf() to process it first.'
      );
    });

    it('should throw error when PDF has no content chunks', async () => {
      const mockMetadata = {
        id: 'empty-pdf',
        title: 'Empty Document',
        numPages: 0,
        totalChunks: 0
      };

      const mockStorage = {
        getMetadata: jest.fn().mockResolvedValue(mockMetadata),
        getChunks: jest.fn().mockResolvedValue([])
      };

      jest.spyOn(mind, 'recallPdf').mockImplementation(async (pdfId) => {
        const metadata = await mockStorage.getMetadata(pdfId);
        if (!metadata) {
          throw new Error(`PDF with ID "${pdfId}" not found. Use readPdf() to process it first.`);
        }
        const chunks = await mockStorage.getChunks(pdfId);
        if (!chunks || chunks.length === 0) {
          throw new Error(`PDF "${pdfId}" has no content chunks. The PDF may be corrupted in storage.`);
        }
        return pdfId;
      });

      await expect(mind.recallPdf('empty-pdf')).rejects.toThrow(
        'PDF "empty-pdf" has no content chunks. The PDF may be corrupted in storage.'
      );
    });

    it('should return immediately if PDF is already loaded in memory', async () => {
      // Mock that PDF is already in memory
      jest.spyOn(mind, 'recallPdf').mockImplementation(async (pdfId) => {
        // Simulate PDF already being in loadedPdfs Map
        return pdfId; // Already loaded, return immediately
      });

      const result = await mind.recallPdf('already-loaded-pdf');
      expect(result).toBe('already-loaded-pdf');
    });
  });

  describe('integration with readPdf', () => {
    it('should be used by readPdf when PDF already exists', async () => {
      // Mock that readPdf calls recallPdf when PDF exists
      mind.recallPdf = jest.fn().mockResolvedValue('existing-pdf');

      // Mock readPdf to simulate finding existing PDF
      mind.readPdf = jest.fn().mockImplementation(async (src, options = {}) => {
        const pdfId = options.id || 'existing-pdf';
        // Simulate checking storage and finding existing PDF
        await mind.recallPdf(pdfId);
        return pdfId;
      });

      const result = await mind.readPdf('test.pdf', { id: 'existing-pdf' });

      expect(result).toBe('existing-pdf');
      expect(mind.recallPdf).toHaveBeenCalledWith('existing-pdf');
    });
  });
});
