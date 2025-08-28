/**
 * PDF Loader Module - Handles PDF reading, indexing, and retrieval-augmented generation
 * Dependencies: PDF.js, IndexedDB for vector storage
 */

// Import PDF.js for PDF processing
let pdfjsLib;
let pdfLoadingPromise;

if (typeof window !== 'undefined') {
  // Browser environment - check for existing PDF.js or load dynamically
  if (window.pdfjsLib) {
    // PDF.js already loaded (e.g., via Webstrates, pre-bundled, etc.)
    pdfjsLib = window.pdfjsLib;
    configureWorker();
    pdfLoadingPromise = Promise.resolve();
  } else {
    // PDF.js not loaded - set up loading promise
    pdfLoadingPromise = loadPdfJs();
  }
} else {
  // Node.js environment - try to require PDF.js carefully
  try {
    // Check if we're in a Jest testing environment or if DOMMatrix is not available
    if (typeof process !== 'undefined' && 
        (process.env.NODE_ENV === 'test' || typeof DOMMatrix === 'undefined')) {
      // In Jest test environment or when DOM APIs aren't available, skip PDF.js loading
      console.log('WarpMind loaded without PDF support (Node.js environment)');
      pdfjsLib = null;
      pdfLoadingPromise = null; // Will be set when needed
    } else {
      // Try to require PDF.js, but handle module not found gracefully
      try {
        pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        pdfLoadingPromise = Promise.resolve();
      } catch (requireError) {
        console.log('WarpMind loaded without PDF support (PDF.js package not found)');
        pdfjsLib = null;
        pdfLoadingPromise = null;
      }
    }
  } catch (error) {
    console.log('WarpMind loaded without PDF support (Node.js environment)');
    pdfjsLib = null;
    pdfLoadingPromise = null; // Will be set when needed
  }
}

// Helper function to configure PDF.js worker
function configureWorker() {
  try {
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  } catch (error) {
    console.warn('Failed to configure PDF.js worker:', error);
  }
}

// Robust PDF.js loading function
async function loadPdfJs() {
  return new Promise((resolve, reject) => {
    // Check if we're in a restrictive environment (e.g., strict CSP)
    if (isRestrictedEnvironment()) {
      reject(new Error('PDF.js loading is restricted in this environment. Please pre-load PDF.js before initializing WarpMind.'));
      return;
    }

    // First, wait a bit to see if PDF.js is being loaded externally (e.g., by Webstrates)
    let attempts = 0;
    const maxWaitAttempts = 20; // Wait up to 2 seconds
    
    const checkForExternalLoad = () => {
      if (window.pdfjsLib) {
        pdfjsLib = window.pdfjsLib;
        configureWorker();
        resolve();
      } else if (attempts < maxWaitAttempts) {
        attempts++;
        setTimeout(checkForExternalLoad, 100);
      } else {
        // No external loading detected, try dynamic loading
        loadPdfJsDynamically().then(resolve).catch(reject);
      }
    };
    
    checkForExternalLoad();
  });
}

// Dynamic PDF.js loading with better error handling
function loadPdfJsDynamically() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    
    let resolved = false;
    
    script.onload = () => {
      if (resolved) return;
      
      // Use a more robust checking mechanism
      let checkAttempts = 0;
      const maxCheckAttempts = 50; // Check for up to 5 seconds
      
      const checkPdfJsAvailable = () => {
        if (window.pdfjsLib) {
          pdfjsLib = window.pdfjsLib;
          configureWorker();
          resolved = true;
          resolve();
        } else if (checkAttempts < maxCheckAttempts) {
          checkAttempts++;
          setTimeout(checkPdfJsAvailable, 100);
        } else {
          resolved = true;
          reject(new Error('PDF.js library failed to initialize after loading'));
        }
      };
      
      checkPdfJsAvailable();
    };
    
    script.onerror = () => {
      if (resolved) return;
      resolved = true;
      reject(new Error('Failed to load PDF.js from CDN. Please check your internet connection or pre-load PDF.js.'));
    };
    
    // Add timeout for the entire loading process
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('PDF.js loading timed out'));
      }
    }, 30000); // 30 second timeout
    
    document.head.appendChild(script);
  });
}

// Check if we're in a restrictive environment
function isRestrictedEnvironment() {
  try {
    // Test if we can create and append a script element
    const testScript = document.createElement('script');
    testScript.src = 'data:text/javascript,';
    document.head.appendChild(testScript);
    document.head.removeChild(testScript);
    return false;
  } catch (error) {
    return true; // CSP or other restrictions prevent script loading
  }
}

// Wait for PDF.js to be ready before using it
async function ensurePdfJsLoaded() {
  // Check if we're in a Jest test environment or Node.js without browser APIs
  if (typeof process !== 'undefined' && 
      (process.env.NODE_ENV === 'test' || typeof DOMMatrix === 'undefined')) {
    console.log('WarpMind loaded without PDF support (Node.js environment)');
    return null;
  }
  
  if (pdfLoadingPromise) {
    try {
      await pdfLoadingPromise;
    } catch (error) {
      console.log('WarpMind loaded without PDF support (PDF.js loading failed)');
      return null;
    }
  } else if (!pdfjsLib) {
    // pdfLoadingPromise is null, which means we're in Node.js without PDF.js support
    console.log('WarpMind loaded without PDF support (PDF.js not available)');
    return null;
  }
  
  if (!pdfjsLib) {
    console.log('WarpMind loaded without PDF support (PDF.js library not loaded)');
    return null;
  }
  return pdfjsLib;
}

// IndexedDB configuration
const DB_NAME = 'warpmind-pdf-storage';
const DB_VERSION = 3; // Increment version for optimized storage schema
const STORE_NAME = 'pdf-chunks';
const METADATA_STORE = 'pdf-metadata';
const CONTENT_STORE = 'pdf-content'; // Store for full text content

class PdfStorage {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    // Handle test environment where IndexedDB is not available
    if (typeof indexedDB === 'undefined' || process.env.NODE_ENV === 'test') {
      // Return a mock db object for testing
      this.db = { 
        isMockDb: true,
        transaction: () => ({
          objectStore: () => ({
            get: () => ({ onsuccess: null, onerror: null, result: null }),
            put: () => ({ onsuccess: null, onerror: null }),
            delete: () => ({ onsuccess: null, onerror: null }),
            getAll: () => ({ onsuccess: null, onerror: null, result: [] })
          })
        })
      };
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create chunks store - optimized to store only indices and references
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('pdfId', 'pdfId', { unique: false });
          store.createIndex('chunkIndex', 'chunkIndex', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metaStore = db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
          metaStore.createIndex('processedAt', 'processedAt', { unique: false });
        }

        // Create content store - single source of truth for text content
        if (!db.objectStoreNames.contains(CONTENT_STORE)) {
          const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: 'id' });
          contentStore.createIndex('pdfId', 'pdfId', { unique: false });
          contentStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  async storeChunk(pdfId, chunkIndex, chunk) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve();
    }
    
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Store only references and indices - text-only optimization
    const chunkData = {
      id: `${pdfId}-${chunkIndex}`,
      pdfId,
      chunkIndex,
      textStart: chunk.textStart,
      textEnd: chunk.textEnd,
      embedding: chunk.embedding,
      embeddingText: chunk.embeddingText,
      pageReferences: chunk.pageReferences
    };

    return new Promise((resolve, reject) => {
      const request = store.put(chunkData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async storeContent(pdfId, type, data, index = null) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve();
    }
    
    const transaction = this.db.transaction([CONTENT_STORE], 'readwrite');
    const store = transaction.objectStore(CONTENT_STORE);
    
    const contentId = index !== null ? `${pdfId}-${type}-${index}` : `${pdfId}-${type}`;
    const contentData = {
      id: contentId,
      pdfId,
      type,
      data,
      index,
      storedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(contentData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getContent(pdfId, type, index = null) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve(null);
    }
    
    const transaction = this.db.transaction([CONTENT_STORE], 'readonly');
    const store = transaction.objectStore(CONTENT_STORE);
    
    const contentId = index !== null ? `${pdfId}-${type}-${index}` : `${pdfId}-${type}`;

    return new Promise((resolve, reject) => {
      const request = store.get(contentId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllContentForPdf(pdfId) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve([]);
    }
    
    const transaction = this.db.transaction([CONTENT_STORE], 'readonly');
    const store = transaction.objectStore(CONTENT_STORE);
    const index = store.index('pdfId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(pdfId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async storeMetadata(pdfId, metadata) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve();
    }
    
    const transaction = this.db.transaction([METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    
    const metaData = {
      id: pdfId,
      ...metadata,
      processedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(metaData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getChunks(pdfId) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve([]);
    }
    
    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('pdfId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(pdfId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getReconstructedChunks(pdfId) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve([]);
    }
    
    // Get chunk metadata
    const chunks = await this.getChunks(pdfId);
    if (!chunks || chunks.length === 0) {
      return [];
    }

    // Get full text content
    const fullTextContent = await this.getContent(pdfId, 'fullText');
    const fullText = fullTextContent ? fullTextContent.data : '';

    // Reconstruct chunks with text-only optimization
    const reconstructedChunks = [];
    for (const chunk of chunks) {
      // Extract text using indices
      const text = fullText.substring(chunk.textStart, chunk.textEnd);
      
      reconstructedChunks.push({
        id: chunk.id,
        pdfId: chunk.pdfId,
        chunkIndex: chunk.chunkIndex,
        text,
        embedding: chunk.embedding,
        embeddingText: chunk.embeddingText,
        pageReferences: chunk.pageReferences,
        textStart: chunk.textStart,
        textEnd: chunk.textEnd
      });
    }

    return reconstructedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getMetadata(pdfId) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve(null);
    }
    
    const transaction = this.db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(pdfId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllMetadata() {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve([]);
    }
    
    const transaction = this.db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deletePdf(pdfId) {
    await this.init();
    
    // Handle test environment gracefully
    if (this.db.isMockDb) {
      return Promise.resolve();
    }
    
    const transaction = this.db.transaction([STORE_NAME, METADATA_STORE, CONTENT_STORE], 'readwrite');
    const chunkStore = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(METADATA_STORE);
    const contentStore = transaction.objectStore(CONTENT_STORE);
    
    const chunkIndex = chunkStore.index('pdfId');
    const contentIndex = contentStore.index('pdfId');

    return new Promise((resolve, reject) => {
      // Delete all chunks for this PDF
      const chunkRequest = chunkIndex.getAll(pdfId);
      chunkRequest.onsuccess = () => {
        const chunks = chunkRequest.result;
        const chunkDeletePromises = chunks.map(chunk => {
          return new Promise((res, rej) => {
            const delRequest = chunkStore.delete(chunk.id);
            delRequest.onsuccess = () => res();
            delRequest.onerror = () => rej(delRequest.error);
          });
        });

        // Delete all content for this PDF
        const contentRequest = contentIndex.getAll(pdfId);
        contentRequest.onsuccess = () => {
          const content = contentRequest.result;
          const contentDeletePromises = content.map(item => {
            return new Promise((res, rej) => {
              const delRequest = contentStore.delete(item.id);
              delRequest.onsuccess = () => res();
              delRequest.onerror = () => rej(delRequest.error);
            });
          });

          // Wait for all deletions to complete
          Promise.all([...chunkDeletePromises, ...contentDeletePromises]).then(() => {
            // Delete metadata
            const metaRequest = metaStore.delete(pdfId);
            metaRequest.onsuccess = () => resolve();
            metaRequest.onerror = () => reject(metaRequest.error);
          }).catch(reject);
        };
        contentRequest.onerror = () => reject(contentRequest.error);
      };
      chunkRequest.onerror = () => reject(chunkRequest.error);
    });
  }

  async getStorageInfo() {
    await this.init();
    const allMetadata = await this.getAllMetadata();
    
    let totalSize = 0;
    const pdfSizes = [];

    for (const metadata of allMetadata) {
      const chunks = await this.getChunks(metadata.id);
      const content = await this.getAllContentForPdf(metadata.id);
      
      // Calculate size from content store (single source of truth)
      const contentSize = content.reduce((acc, item) => {
        const dataSize = typeof item.data === 'string' ? 
          new Blob([item.data]).size : 
          (item.data?.length || 0) * 4; // Assume embedding arrays are float32
        return acc + dataSize;
      }, 0);
      
      // Calculate chunk metadata size (much smaller now)
      const chunkSize = chunks.reduce((acc, chunk) => {
        const embeddingSize = chunk.embedding ? chunk.embedding.length * 4 : 0;
        const metadataSize = JSON.stringify({
          textStart: chunk.textStart,
          textEnd: chunk.textEnd,
          pageReferences: chunk.pageReferences
        }).length;
        return acc + embeddingSize + metadataSize;
      }, 0);

      const totalPdfSize = contentSize + chunkSize;

      pdfSizes.push({
        id: metadata.id,
        title: metadata.title || metadata.id,
        size: totalPdfSize / (1024 * 1024), // Convert to MB
        contentSize: contentSize / (1024 * 1024),
        chunkMetadataSize: chunkSize / (1024 * 1024),
        chunks: chunks.length,
        processedAt: metadata.processedAt
      });

      totalSize += totalPdfSize;
    }

    return {
      totalSize: totalSize / (1024 * 1024), // Convert to MB
      unit: 'MB',
      pdfs: pdfSizes.sort((a, b) => b.size - a.size),
      optimized: true // Flag to indicate this is using optimized storage
    };
  }
}

// Utility functions for text chunking and vector operations
function chunkText(text, maxTokens = 400) {
  // Improved chunking that preserves original text structure
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  const chunks = [];
  let currentChunk = '';
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    
    if (currentTokens + sentenceTokens > maxTokens && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentTokens = sentenceTokens;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentTokens += sentenceTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function estimateTokens(text) {
  // Simple token estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function createPdfLoaderModule(client) {
  const storage = new PdfStorage();
  const loadedPdfs = new Map(); // In-memory cache for quick access

  return {
    async readPdf(src, options = {}) {
      const {
        id = null,
        chunkTokens = 400,
        embedModel = 'text-embedding-3-small',
        onProgress = null,
        pageRange = null  // [startPage, endPage] or { start: number, end: number }
      } = options;
      
      // Fixed maximum pages limit to prevent excessive API usage
      const MAX_PAGES = 100;
      
      // Safe progress update function that won't throw errors
      const safeProgress = (progress) => {
        if (typeof onProgress === 'function') {
          try {
            onProgress(progress);
          } catch (e) {
            console.warn('Error in progress callback:', e);
          }
        }
      };

      let pdfId = id;
      let pdfDoc;
      let file;
      
      // Start with initial progress
      safeProgress(0.01);

      // Setup progress pulse to ensure regular UI updates even during slow operations
      let lastProgressUpdate = 0;
      let progressPulseInterval = null;
      
      const startProgressPulse = (currentProgress, description) => {
        if (progressPulseInterval) clearInterval(progressPulseInterval);
        
        // Create a pulse that shows small increments to indicate the system is still working
        let pulseCount = 0;
        progressPulseInterval = setInterval(() => {
          pulseCount++;
          // Only pulse if no real progress has been reported for 2 seconds
          const now = Date.now();
          if (now - lastProgressUpdate > 2000) {
            const pulseDescription = `${description || 'Processing'} (waiting for backend response...)`;
            this._safeProgressCallback(currentProgress, pulseDescription);
          }
          
          // After 30 seconds (15 pulses at 2s intervals), show a more explicit message
          if (pulseCount === 15) {
            console.log('Operation taking longer than expected. Backend may be under heavy load.');
          }
        }, 2000);
      };
      
      const stopProgressPulse = () => {
        if (progressPulseInterval) {
          clearInterval(progressPulseInterval);
          progressPulseInterval = null;
        }
      };
      
      // Update our safe progress callback to track the last update time
      const originalSafeProgressCallback = this._safeProgressCallback;
      this._safeProgressCallback = (progress, description) => {
        lastProgressUpdate = Date.now();
        originalSafeProgressCallback.call(this, progress, description);
      };

      try {
        // Ensure PDF.js is loaded before proceeding
        const pdfLib = await ensurePdfJsLoaded();
        if (!pdfLib) {
          throw new Error('PDF functionality is not available. WarpMind was loaded without PDF support. This may be due to the environment not supporting PDF.js or a loading failure.');
        }

        // Handle different input types
        if (typeof src === 'string') {
          // Check if it's a local file system path (Windows/Unix absolute paths)
          const isLocalFilePath = /^([a-zA-Z]:\\|\/[^\/]|~\/|\.{1,2}[\\\/])/.test(src) && 
                                 !src.startsWith('./') && 
                                 !src.startsWith('../') && 
                                 !src.startsWith('/');
          
          if (isLocalFilePath) {
            throw new Error('Local file system paths are not supported in browser environment. Use relative URLs or full URLs instead.');
          }
          
          // All other strings are treated as URLs (relative or absolute)
          const response = await fetch(src);
          if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
          const arrayBuffer = await response.arrayBuffer();
          file = new Uint8Array(arrayBuffer);
          pdfId = pdfId || src.split('/').pop().replace('.pdf', '');
        } else if (src instanceof File) {
          // File object input
          const arrayBuffer = await src.arrayBuffer();
          file = new Uint8Array(arrayBuffer);
          pdfId = pdfId || src.name.replace('.pdf', '');
        } else {
          throw new Error('Invalid PDF source. Must be a File object or URL string.');
        }

        // Check if PDF is already processed
        const existingMetadata = await storage.getMetadata(pdfId);
        if (existingMetadata) {
          // Use recallPdf method for consistency
          await this.recallPdf(pdfId);
          
          safeProgress(1.0);
          return pdfId;
        }

        // PDF.js should now be available
        if (!pdfjsLib) {
          throw new Error('PDF.js is not available. Please ensure PDF.js is loaded.');
        }

        // Load PDF document
        let numPages;
        try {
          pdfDoc = await pdfjsLib.getDocument({ data: file }).promise;
          numPages = pdfDoc.numPages;
        
          safeProgress(0.1);
        } catch (error) {
          console.error('Error loading PDF document:', error);
          throw new Error(`Failed to load PDF document: ${error.message}`);
        }

        // Validate and calculate page range
        let startPage = 1;
        let endPage = numPages;
        
        if (pageRange) {
          // Handle both array [start, end] and object { start, end } formats
          if (Array.isArray(pageRange)) {
            [startPage, endPage] = pageRange;
          } else if (typeof pageRange === 'object' && pageRange.start && pageRange.end) {
            startPage = pageRange.start;
            endPage = pageRange.end;
          } else {
            throw new Error('pageRange must be an array [startPage, endPage] or object { start: number, end: number }');
          }
          
          // Validate page range
          if (startPage < 1 || endPage > numPages || startPage > endPage) {
            throw new Error(`Invalid page range [${startPage}, ${endPage}]. PDF has ${numPages} pages.`);
          }
        }
        
        // Calculate actual pages to process
        const pagesToProcess = endPage - startPage + 1;
        
        // Enforce maximum pages limit
        if (pagesToProcess > MAX_PAGES) {
          if (pageRange) {
            throw new Error(`Page range [${startPage}, ${endPage}] contains ${pagesToProcess} pages, which exceeds the maximum limit of ${MAX_PAGES} pages. Please specify a smaller range.`);
          } else {
            throw new Error(`PDF has ${numPages} pages, which exceeds the maximum limit of ${MAX_PAGES} pages. Please specify a pageRange to process a subset of pages (e.g., { pageRange: [1, ${MAX_PAGES}] }).`);
          }
        }

        // Extract text from specified page range
        const pageContents = [];
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          const page = await pdfDoc.getPage(pageNum);
          
          // Extract text
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');

          // Store text only - no image processing
          pageContents.push({
            pageNum,
            text: pageText
          });

          // Update progress based on pages processed within the range
          const pagesProcessed = pageNum - startPage + 1;
          safeProgress(0.1 + (pagesProcessed / pagesToProcess) * 0.4);
        }

        // Combine all text and create chunks
        const fullText = pageContents.map(page => page.text).join('\n\n');
        const textChunks = chunkText(fullText, chunkTokens);
        
        // Create simplified chunks with text-only processing
        const enhancedChunks = [];
        let currentTextPosition = 0;

        safeProgress(0.5); // Update progress before starting the loop

        for (let i = 0; i < textChunks.length; i++) {
          const chunkText = textChunks[i];
          
          // Try to find chunk text with improved matching
          let textStart = this._findChunkPosition(fullText, chunkText, currentTextPosition);
          let textEnd = textStart + chunkText.length;
          
          // Find relevant pages for this chunk 
          const chunkPageRefs = this._findPageReferences(chunkText, pageContents);

          enhancedChunks.push({
            chunkIndex: i,
            textStart,
            textEnd,
            pageReferences: chunkPageRefs
          });

          currentTextPosition = textEnd;
          
          // Update progress less frequently to avoid UI freezing
          if (i % 5 === 0) {
            safeProgress(0.5 + (i / textChunks.length) * 0.3);
          }
        }
        
        // Final progress update after loop completes
        safeProgress(0.8);

        // Generate embeddings for each chunk
        const chunksWithEmbeddings = [];
        
        // Prepare all chunk texts for embedding
        const chunkTextsForEmbedding = [];
        for (let i = 0; i < enhancedChunks.length; i++) {
          const chunk = enhancedChunks[i];
          // Check for valid start/end indices
          if (chunk.textStart >= 0 && chunk.textEnd <= fullText.length && chunk.textStart < chunk.textEnd) {
            const chunkText = fullText.substring(chunk.textStart, chunk.textEnd);
            // Text-only processing
            chunkTextsForEmbedding.push({ chunk, embeddingText: chunkText });
          } else {
            console.warn(`Invalid text indices for chunk ${i}: start=${chunk.textStart}, end=${chunk.textEnd}, textLength=${fullText.length}`);
            chunkTextsForEmbedding.push({ 
              chunk, 
              embeddingText: `Chunk ${i} with invalid indices` 
            });
          }
        }
        
        if (onProgress) onProgress(0.8);
        
        // Process embeddings with better progress updates
        for (let i = 0; i < chunkTextsForEmbedding.length; i++) {
          const { chunk, embeddingText } = chunkTextsForEmbedding[i];
          
          try {
            const embedding = await this._generateEmbedding(embeddingText, embedModel);
            chunksWithEmbeddings.push({
              ...chunk,
              embedding,
              embeddingText
            });
          } catch (error) {
            console.warn(`Failed to generate embedding for chunk ${i}:`, error);
            chunksWithEmbeddings.push({
              ...chunk,
              embedding: null,
              embeddingText: chunk.embeddingText
            });
          }

          // Update progress less frequently
          if (i % 3 === 0 || i === chunkTextsForEmbedding.length - 1) {
            safeProgress(0.8 + (i / chunkTextsForEmbedding.length) * 0.15);
          }
        }

        // Store in optimized format
        const metadata = {
          title: pdfId,
          numPages,
          pagesProcessed: pagesToProcess,
          pageRange: pageRange ? { start: startPage, end: endPage } : null,
          totalChunks: chunksWithEmbeddings.length,
          chunkTokens,
          embedModel,
          estimatedTokens: Math.ceil(fullText.length / 4)
        };

        safeProgress(0.85);
        
        try {
          // Store metadata first
          await storage.storeMetadata(pdfId, metadata);
          safeProgress(0.87);

          // Store full text once (single source of truth)
          await storage.storeContent(pdfId, 'fullText', fullText);
          safeProgress(0.9);

          // Store page contents for formatting purposes
          await storage.storeContent(pdfId, 'pageContents', pageContents);
          safeProgress(0.92);

          // Store optimized chunks (only indices and embeddings) - batch for performance
          for (let i = 0; i < chunksWithEmbeddings.length; i += 10) {
            const chunkBatch = chunksWithEmbeddings.slice(i, i + 10);
            await Promise.all(
              chunkBatch.map(chunk => storage.storeChunk(pdfId, chunk.chunkIndex, chunk))
            );
            
            const chunkProgress = 0.92 + (Math.min(i + 10, chunksWithEmbeddings.length) / chunksWithEmbeddings.length) * 0.08;
            safeProgress(chunkProgress);
          }
          
          safeProgress(1.0);
        } catch (error) {
          console.error('Error storing PDF data:', error);
          throw new Error(`Failed to store PDF data: ${error.message}`);
        }

        // Create lightweight chunks for in-memory cache (text-only optimization)
        const reconstructedChunks = chunksWithEmbeddings.map(chunk => ({
          id: `${pdfId}-${chunk.chunkIndex}`,
          pdfId,
          chunkIndex: chunk.chunkIndex,
          text: fullText.substring(chunk.textStart, chunk.textEnd),
          embedding: chunk.embedding,
          embeddingText: chunk.embeddingText,
          pageReferences: chunk.pageReferences,
          textStart: chunk.textStart,
          textEnd: chunk.textEnd
        }));

        // Cache in memory for quick access (text-only optimization)
        loadedPdfs.set(pdfId, { 
          metadata: { ...metadata, fullText, pageContents },
          chunks: reconstructedChunks
        });

        // Register retrieval tool
        this._registerPdfRetrievalTool(pdfId, metadata.title);

        if (onProgress) onProgress(1.0);
        return pdfId;

      } catch (error) {
        // Log the full error for debugging
        console.error('PDF processing error:', error);
        
        // Set progress to 0 to indicate failure
        safeProgress(0);
        
        // Handle specific error types with friendly messages
        if (error.message.includes('PDF.js')) {
          throw new Error('PDF features are not available. This may be due to the environment not supporting PDF.js. Please ensure PDF.js can be loaded in your platform.');
        } else if (error.name === 'PasswordException') {
          throw new Error('The PDF is password protected. Please provide an unprotected PDF.');
        } else if (error.name === 'InvalidPDFException') {
          throw new Error('The PDF is invalid or corrupted. Please try a different file.');
        } else if (error.message.includes('storage') || error.name === 'QuotaExceededError') {
          throw new Error('Storage quota exceeded. Please clear some space by removing unused PDFs.');
        } else {
          // Generic error with the original message
          throw new Error(`Failed to process PDF: ${error.message}`);
        }
      } finally {
        // Make sure we clean up the progress pulse
        stopProgressPulse();
      }
    },

    async isPdfRead(pdfIds) {
      if (Array.isArray(pdfIds)) {
        const results = {};
        for (const pdfId of pdfIds) {
          const metadata = await storage.getMetadata(pdfId);
          results[pdfId] = !!metadata;
        }
        return results;
      } else {
        const metadata = await storage.getMetadata(pdfIds);
        return !!metadata;
      }
    },

    async listReadPdfs() {
      const allMetadata = await storage.getAllMetadata();
      return allMetadata.map(meta => ({
        id: meta.id,
        title: meta.title,
        numPages: meta.numPages,
        pagesProcessed: meta.pagesProcessed || meta.numPages, // Backward compatibility
        pageRange: meta.pageRange || null,
        totalChunks: meta.totalChunks,
        processedAt: meta.processedAt
      }));
    },

    async forgetPdf(pdfId) {
      await storage.deletePdf(pdfId);
      loadedPdfs.delete(pdfId);
      
      // Unregister retrieval tool
      this._unregisterPdfRetrievalTool(pdfId);
    },

    async recallPdf(pdfId) {
      // Check if PDF is already loaded in memory
      if (loadedPdfs.has(pdfId)) {
        return pdfId; // Already loaded
      }

      // Check if PDF exists in storage
      const metadata = await storage.getMetadata(pdfId);
      if (!metadata) {
        throw new Error(`PDF with ID "${pdfId}" not found. Use readPdf() to process it first.`);
      }

      // Load chunks from storage using optimized method
      const chunks = await storage.getReconstructedChunks(pdfId);
      if (!chunks || chunks.length === 0) {
        throw new Error(`PDF "${pdfId}" has no content chunks. The PDF may be corrupted in storage.`);
      }

      // Get additional content for metadata
      const fullTextContent = await storage.getContent(pdfId, 'fullText');
      const pageContentsContent = await storage.getContent(pdfId, 'pageContents');
      
      const enrichedMetadata = {
        ...metadata,
        fullText: fullTextContent ? fullTextContent.data : '',
        pageContents: pageContentsContent ? pageContentsContent.data : []
      };

      // Load into memory cache
      loadedPdfs.set(pdfId, { metadata: enrichedMetadata, chunks });

      // Register retrieval tools
      this._registerPdfRetrievalTool(pdfId, metadata.title);

      return pdfId;
    },

    async getPdfStorageInfo() {
      return await storage.getStorageInfo();
    },

    async _generateEmbedding(text, model) {
      // Use the client's embed method
      try {
        // Add a timeout indicator for slow backend responses
        const startTime = Date.now();
        const timeoutWarning = setTimeout(() => {
          console.log('Embedding request taking longer than expected. Backend may be slow to respond.');
        }, 5000); // 5 second warning
        
        const result = await client.embed(text, { model });
        
        // Clear the timeout warning
        clearTimeout(timeoutWarning);
        
        // Log duration for performance monitoring
        const duration = Date.now() - startTime;
        if (duration > 5000) {
          console.log(`Embedding request completed after ${(duration/1000).toFixed(1)}s - backend response was slow.`);
        }
        
        return result;
      } catch (error) {
        console.warn('API embedding failed, falling back to local embedding:', error.message);
        return this._generateLocalEmbedding(text);
      }
    },

    _generateLocalEmbedding(text) {
      // Simple local embedding: convert text to a feature vector
      // This is a basic implementation for demo purposes
      const words = text.toLowerCase().split(/\s+/);
      const embedding = new Array(384).fill(0); // Standard embedding size
      
      // Use word frequencies and positions to create features
      const wordCounts = {};
      words.forEach((word, index) => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
        
        // Add positional information
        const hash = this._simpleHash(word);
        embedding[hash % 384] += 1 / (index + 1); // Weight by position
      });
      
      // Add word frequency features
      Object.entries(wordCounts).forEach(([word, count]) => {
        const hash = this._simpleHash(word);
        embedding[(hash + 100) % 384] += Math.log(count + 1);
      });
      
      // Add text length features
      embedding[0] = Math.log(text.length + 1) / 10;
      embedding[1] = words.length / 100;
      
      // Normalize the embedding
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] /= magnitude;
        }
      }
      
      return embedding;
    },

    _simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash);
    },

    _findChunkPosition(fullText, chunkText, startPosition = 0) {
      // First try exact match from the current position
      let position = fullText.indexOf(chunkText, startPosition);
      if (position !== -1) {
        return position;
      }
      
      // If exact match fails, try fuzzy matching by normalizing whitespace
      const normalizeText = (text) => text.replace(/\s+/g, ' ').trim();
      const normalizedChunk = normalizeText(chunkText);
      const normalizedFull = normalizeText(fullText);
      
      position = normalizedFull.indexOf(normalizedChunk, Math.max(0, startPosition - 100));
      if (position !== -1) {
        // Map back to original text position by counting characters
        let originalPos = 0;
        let normalizedPos = 0;
        
        while (normalizedPos < position && originalPos < fullText.length) {
          if (!/\s/.test(fullText[originalPos]) || normalizedFull[normalizedPos] === ' ') {
            normalizedPos++;
          }
          originalPos++;
        }
        return originalPos;
      }
      
      // Try searching from the beginning
      position = fullText.indexOf(chunkText, 0);
      if (position !== -1) {
        return position;
      }
      
      // Try fuzzy match from beginning
      position = normalizedFull.indexOf(normalizedChunk, 0);
      if (position !== -1) {
        let originalPos = 0;
        let normalizedPos = 0;
        
        while (normalizedPos < position && originalPos < fullText.length) {
          if (!/\s/.test(fullText[originalPos]) || normalizedFull[normalizedPos] === ' ') {
            normalizedPos++;
          }
          originalPos++;
        }
        return originalPos;
      }
      
      // Last resort: use approximate position based on chunk order
      return Math.max(startPosition, 0);
    },

    _findPageReferences(text, pageContents) {
      const references = [];
      
      for (const page of pageContents) {
        if (page.text.includes(text.substring(0, 100))) {
          references.push(page.pageNum);
        }
      }
      
      return references;
    },

    _registerPdfRetrievalTool(pdfId, title) {
      // Register tools for PDF access
      const searchToolName = `search_pdf_${pdfId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const fullTextToolName = `get_full_text_${pdfId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      try {
        // Register semantic search tool (for large PDFs or specific queries)
        client.registerTool({
          name: searchToolName,
          description: `Searches the PDF "${title}" to find relevant passages about specific topics, concepts, or quotes. Returns the most relevant text chunks that match the search query.`,
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search terms or concept to find in the PDF'
              },
              topResults: {
                type: 'number',
                description: 'Number of relevant passages to return (1-8)',
                default: 4,
                maximum: 8
              }
            },
            required: ['query']
          },
          handler: async (args) => {
            const numResults = Math.min(args.topResults || 4, 8);
            return await this._searchPdf(pdfId, args.query, numResults);
          }
        });

        // Register full text tool (for smaller PDFs or comprehensive analysis)
        client.registerTool({
          name: fullTextToolName,
          description: `Retrieves the complete text content of the PDF "${title}". Useful for comprehensive analysis, summaries, or when examining the entire document structure.`,
          parameters: {
            type: 'object',
            properties: {
              includePageNumbers: {
                type: 'boolean', 
                description: 'Include page numbers in the text',
                default: true
              }
            },
            required: []
          },
          handler: async (args) => {
            return await this._getFullPdfText(pdfId, args.includePageNumbers !== false);
          }
        });
      } catch (error) {
        console.warn(`Failed to register retrieval tools for PDF ${pdfId}:`, error);
      }
    },

    _unregisterPdfRetrievalTool(pdfId) {
      // Note: This would require implementing tool unregistration in the main class
      // For now, we'll just log the intent
      console.log(`Would unregister retrieval tool for PDF ${pdfId}`);
    },

    async _searchPdf(pdfId, query, topResults = 2) {
      try {
        // Get PDF chunks
        let chunks;
        if (loadedPdfs.has(pdfId)) {
          chunks = loadedPdfs.get(pdfId).chunks;
        } else {
          chunks = await storage.getReconstructedChunks(pdfId);
        }

        if (!chunks || chunks.length === 0) {
          return { error: 'PDF not found or has no content' };
        }

        // Generate embedding for query
        const queryEmbedding = await this._generateEmbedding(query, 'text-embedding-3-small');

        // Calculate similarities
        const similarities = chunks.map(chunk => ({
          ...chunk,
          similarity: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0
        }));

        // Sort by similarity and get top results
        const topChunks = similarities
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, topResults);

        // Format results with truncation to avoid context length issues
        const results = [];
        for (const chunk of topChunks) {
          // Truncate text if it's too long (keep first 300 tokens worth of text)
          let text = chunk.text;
          if (text.length > 1200) { // Roughly 300 tokens
            text = text.substring(0, 1200) + '...';
          }
          
          results.push({
            text,
            similarity: chunk.similarity,
            pageReferences: chunk.pageReferences,
            chunkIndex: chunk.chunkIndex
          });
        }

        return {
          results,
          totalChunks: chunks.length,
          query
        };

      } catch (error) {
        return { error: `Search failed: ${error.message}` };
      }
    },

    async _getFullPdfText(pdfId, includePageNumbers = true) {
      try {
        // Get PDF metadata and content
        let metadata, fullText, pageContents;
        
        if (loadedPdfs.has(pdfId)) {
          const cached = loadedPdfs.get(pdfId);
          metadata = cached.metadata;
          fullText = metadata.fullText;
          pageContents = metadata.pageContents;
        } else {
          metadata = await storage.getMetadata(pdfId);
          if (!metadata) {
            return { error: 'PDF not found' };
          }
          
          const fullTextContent = await storage.getContent(pdfId, 'fullText');
          const pageContentsContent = await storage.getContent(pdfId, 'pageContents');
          
          fullText = fullTextContent ? fullTextContent.data : '';
          pageContents = pageContentsContent ? pageContentsContent.data : [];
        }

        if (!fullText) {
          return { error: 'PDF has no content' };
        }

        let result = fullText;

        // If we need page numbers, format the text appropriately
        if (includePageNumbers && pageContents && pageContents.length > 0) {
          let formattedText = '';
          
          for (let i = 0; i < pageContents.length; i++) {
            const page = pageContents[i];
            
            // Add page number markers if requested
            if (includePageNumbers) {
              formattedText += `\n\n--- Page ${page.pageNum} ---\n`;
            }
            
            // Add page text
            formattedText += page.text;
                        
            formattedText += '\n\n';
          }
          
          result = formattedText.trim();
        }

        return {
          fullText: result,
          metadata: {
            title: metadata.title,
            pages: metadata.numPages,
            chunks: metadata.totalChunks,
            estimatedTokens: metadata.estimatedTokens || Math.ceil(result.length / 4),
            processedAt: metadata.processedAt,
            optimizedStorage: true
          }
        };

      } catch (error) {
        return { error: `Failed to get full text: ${error.message}` };
      }
    },

    async _processTextChunk(chunkId, textChunk, pages, options) {
      const { pageNums, content } = textChunk;
      
      try {
        // Generate embedding for the chunk
        this._safeProgressCallback(options.currentProgress, `Generating embedding for chunk ${options.chunkCounter}/${options.totalChunks}`);
        
        // Start progress pulse before potentially slow embedding operation
        startProgressPulse(options.currentProgress, `Generating embedding for chunk ${options.chunkCounter}/${options.totalChunks}`);
        
        const embedding = await this._generateEmbedding(content, options.embeddingModel);
        
        // Stop progress pulse as we've completed this embedding
        stopProgressPulse();
        
        // Store the content first to get its ID
        const contentId = await this._storeContent(content, 'text');
        
        // Store the chunk with a reference to the content
        const chunkData = {
          id: chunkId,
          contentId,
          type: 'text',
          pages: pageNums,
          metadata: {
            pageNums,
            source: options.source || 'pdf',
            title: options.title || 'Untitled PDF',
          },
          embedding
        };

        // Store the chunk data
        await this._storeChunk(chunkData);
        
        // Update the progress with a small increment
        options.currentProgress += options.progressIncrement;
        this._safeProgressCallback(options.currentProgress, `Processed chunk ${options.chunkCounter}/${options.totalChunks}`);
        options.chunkCounter++;
        
      } catch (error) {
        console.error('Error processing text chunk:', error);
        throw error;
      }
    },
  };
}

module.exports = createPdfLoaderModule;
