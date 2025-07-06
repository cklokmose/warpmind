/**
 * PDF Loader Module - Handles PDF reading, indexing, and retrieval-augmented generation
 * Dependencies: PDF.js, IndexedDB for vector storage
 */

// Import PDF.js for PDF processing
let pdfjsLib;
if (typeof window !== 'undefined') {
  // Browser environment - load PDF.js from CDN or bundle
  if (typeof pdfjsLib === 'undefined') {
    // Load PDF.js dynamically if not already loaded
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    document.head.appendChild(script);
    
    // Wait for PDF.js to load
    script.onload = () => {
      pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    };
  }
} else {
  // Node.js environment - require PDF.js
  try {
    pdfjsLib = require('pdfjs-dist');
  } catch (error) {
    console.warn('PDF.js not available in Node.js environment');
  }
}

// IndexedDB configuration
const DB_NAME = 'warpmind-pdf-storage';
const DB_VERSION = 1;
const STORE_NAME = 'pdf-chunks';
const METADATA_STORE = 'pdf-metadata';

class PdfStorage {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create chunks store
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
      };
    });
  }

  async storeChunk(pdfId, chunkIndex, chunk) {
    await this.init();
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const chunkData = {
      id: `${pdfId}-${chunkIndex}`,
      pdfId,
      chunkIndex,
      ...chunk
    };

    return new Promise((resolve, reject) => {
      const request = store.put(chunkData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async storeMetadata(pdfId, metadata) {
    await this.init();
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
    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('pdfId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(pdfId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(pdfId) {
    await this.init();
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
    const transaction = this.db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
    const chunkStore = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(METADATA_STORE);
    const index = chunkStore.index('pdfId');

    return new Promise((resolve, reject) => {
      // Delete all chunks for this PDF
      const chunkRequest = index.getAll(pdfId);
      chunkRequest.onsuccess = () => {
        const chunks = chunkRequest.result;
        const deletePromises = chunks.map(chunk => {
          return new Promise((res, rej) => {
            const delRequest = chunkStore.delete(chunk.id);
            delRequest.onsuccess = () => res();
            delRequest.onerror = () => rej(delRequest.error);
          });
        });

        Promise.all(deletePromises).then(() => {
          // Delete metadata
          const metaRequest = metaStore.delete(pdfId);
          metaRequest.onsuccess = () => resolve();
          metaRequest.onerror = () => reject(metaRequest.error);
        }).catch(reject);
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
      const pdfSize = chunks.reduce((acc, chunk) => {
        // Estimate size based on text content and embeddings
        const textSize = new Blob([chunk.text]).size;
        const embeddingSize = chunk.embedding ? chunk.embedding.length * 4 : 0; // 4 bytes per float
        const imageSize = chunk.images ? chunk.images.reduce((sum, img) => sum + (img.description?.length || 0), 0) : 0;
        return acc + textSize + embeddingSize + imageSize;
      }, 0);

      pdfSizes.push({
        id: metadata.id,
        title: metadata.title || metadata.id,
        size: pdfSize / (1024 * 1024), // Convert to MB
        chunks: chunks.length,
        processedAt: metadata.processedAt
      });

      totalSize += pdfSize;
    }

    return {
      totalSize: totalSize / (1024 * 1024), // Convert to MB
      unit: 'MB',
      pdfs: pdfSizes.sort((a, b) => b.size - a.size)
    };
  }
}

// Utility functions for text chunking and vector operations
function chunkText(text, maxTokens = 400) {
  // Simple chunking based on sentences and token estimation
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
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
      currentChunk += (currentChunk ? '. ' : '') + sentence;
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
        processImages = true,
        imageDetail = 'low',
        imagePrompt = 'Describe this image, chart, or diagram in detail for academic use',
        onProgress = null
      } = options;

      let pdfId = id;
      let pdfDoc;
      let file;

      try {
        // Handle different input types
        if (typeof src === 'string') {
          if (src.startsWith('http')) {
            // URL input
            const response = await fetch(src);
            if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            file = new Uint8Array(arrayBuffer);
            pdfId = pdfId || src.split('/').pop().replace('.pdf', '');
          } else {
            // File path input
            throw new Error('File path inputs are not supported in browser environment');
          }
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
          // Load from cache
          const chunks = await storage.getChunks(pdfId);
          loadedPdfs.set(pdfId, { metadata: existingMetadata, chunks });
          
          // Register retrieval tool
          this._registerPdfRetrievalTool(pdfId, existingMetadata.title);
          
          if (onProgress) onProgress(1.0);
          return pdfId;
        }

        // Wait for PDF.js to be available
        if (typeof window !== 'undefined' && !pdfjsLib) {
          await new Promise(resolve => {
            const checkPdfjs = () => {
              if (window.pdfjsLib) {
                pdfjsLib = window.pdfjsLib;
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve();
              } else {
                setTimeout(checkPdfjs, 100);
              }
            };
            checkPdfjs();
          });
        }

        if (!pdfjsLib) {
          throw new Error('PDF.js is not available. Please ensure PDF.js is loaded.');
        }

        // Load PDF document
        pdfDoc = await pdfjsLib.getDocument({ data: file }).promise;
        const numPages = pdfDoc.numPages;

        if (onProgress) onProgress(0.1);

        // Extract text and images from all pages
        const pageContents = [];
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdfDoc.getPage(pageNum);
          
          // Extract text
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          
          let pageImages = [];
          if (processImages) {
            // Extract images from page
            pageImages = await this._extractImagesFromPage(page, imageDetail, imagePrompt);
          }

          pageContents.push({
            pageNum,
            text: pageText,
            images: pageImages
          });

          if (onProgress) onProgress(0.1 + (pageNum / numPages) * 0.4);
        }

        // Combine all text and create chunks
        const fullText = pageContents.map(page => page.text).join('\n\n');
        const textChunks = chunkText(fullText, chunkTokens);

        // Create enhanced chunks with image context
        const enhancedChunks = [];
        let currentPageImages = [];
        let currentPageNum = 1;

        for (let i = 0; i < textChunks.length; i++) {
          const chunk = textChunks[i];
          
          // Find relevant images for this chunk
          const chunkImages = pageContents
            .filter(page => page.images.length > 0)
            .flatMap(page => page.images.map(img => ({ ...img, pageNum: page.pageNum })));

          enhancedChunks.push({
            text: chunk,
            images: chunkImages,
            chunkIndex: i,
            pageReferences: this._findPageReferences(chunk, pageContents)
          });

          if (onProgress) onProgress(0.5 + (i / textChunks.length) * 0.3);
        }

        // Generate embeddings for each chunk
        const chunksWithEmbeddings = [];
        for (let i = 0; i < enhancedChunks.length; i++) {
          const chunk = enhancedChunks[i];
          
          // Combine text and image descriptions for embedding
          const imageDescriptions = chunk.images.map(img => img.description).join(' ');
          const embeddingText = chunk.text + (imageDescriptions ? ' ' + imageDescriptions : '');
          
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
              embeddingText
            });
          }

          if (onProgress) onProgress(0.8 + (i / enhancedChunks.length) * 0.15);
        }

        // Store in IndexedDB
        const metadata = {
          title: pdfId,
          numPages,
          totalChunks: chunksWithEmbeddings.length,
          chunkTokens,
          embedModel,
          processImages,
          imageDetail,
          fullText: fullText, // Store the complete text
          pageContents: pageContents, // Store page-by-page content with images
          estimatedTokens: Math.ceil(fullText.length / 4) // Pre-calculate token estimate
        };

        await storage.storeMetadata(pdfId, metadata);

        for (const chunk of chunksWithEmbeddings) {
          await storage.storeChunk(pdfId, chunk.chunkIndex, chunk);
        }

        // Cache in memory
        loadedPdfs.set(pdfId, { metadata, chunks: chunksWithEmbeddings });

        // Register retrieval tool
        this._registerPdfRetrievalTool(pdfId, metadata.title);

        if (onProgress) onProgress(1.0);
        return pdfId;

      } catch (error) {
        throw new Error(`Failed to process PDF: ${error.message}`);
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

    async getPdfStorageInfo() {
      return await storage.getStorageInfo();
    },

    async _extractImagesFromPage(page, detail, prompt) {
      // Skip image analysis if we don't have a valid API key
      if (!client.apiKey || client.apiKey === 'test-key' || client.apiKey.includes('demo')) {
        console.log('Skipping image analysis: Demo mode or no API key');
        return [];
      }
      
      const images = [];
      
      try {
        // Get page viewport for rendering
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Create canvas for rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page to canvas
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        
        // Analyze image with vision AI
        try {
          const analysis = await client.analyzeImage(blob, prompt, {
            detail: detail
          });
          
          if (analysis && analysis.trim()) {
            images.push({
              description: analysis,
              type: 'page-render',
              detail: detail
            });
          }
        } catch (error) {
          console.warn('Failed to analyze page image:', error);
          // Add a placeholder description for the image
          images.push({
            description: `Image from page (analysis failed: ${error.message})`,
            type: 'page-render',
            detail: detail
          });
        }

      } catch (error) {
        console.warn('Failed to extract images from page:', error);
      }

      return images;
    },

    async _generateEmbedding(text, model) {
      // Use the client's embed method
      try {
        return await client.embed(text, { model });
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
      
      try {      // Register semantic search tool (for large PDFs or specific queries)
      client.registerTool({
        name: searchToolName,
        description: `Search and retrieve relevant chunks from the PDF "${title}". Returns up to 8 most relevant chunks (default: 4). Use this for finding specific information in large PDFs. For comprehensive analysis, summaries, or lists, consider using the full text tool instead.`,
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant information in the PDF'
            },
            topResults: {
              type: 'number',
              description: 'Number of most relevant chunks to return (default: 4, max: 8)',
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
          description: `Get the complete full text of the PDF "${title}". Use this for comprehensive analysis, summaries, creating lists, or when you need to see the entire document. For specific queries or large PDFs, use the search tool instead.`,
          parameters: {
            type: 'object',
            properties: {
              includeImages: {
                type: 'boolean',
                description: 'Whether to include image descriptions in the output (default: true)',
                default: true
              },
              includePageNumbers: {
                type: 'boolean', 
                description: 'Whether to include page number markers in the text (default: true)',
                default: true
              }
            },
            required: []
          },
          handler: async (args) => {
            return await this._getFullPdfText(pdfId, args.includeImages !== false, args.includePageNumbers !== false);
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
          chunks = await storage.getChunks(pdfId);
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
        const results = topChunks.map(chunk => {
          // Truncate text if it's too long (keep first 300 tokens worth of text)
          let text = chunk.text;
          if (text.length > 1200) { // Roughly 300 tokens
            text = text.substring(0, 1200) + '...';
          }
          
          // Limit image descriptions to avoid context overflow
          let images = chunk.images || [];
          if (images.length > 2) {
            images = images.slice(0, 2);
          }
          
          return {
            text,
            similarity: chunk.similarity,
            pageReferences: chunk.pageReferences,
            images: images.map(img => ({
              description: img.description.length > 200 ? 
                img.description.substring(0, 200) + '...' : 
                img.description,
              type: img.type
            })),
            chunkIndex: chunk.chunkIndex
          };
        });

        return {
          results,
          totalChunks: chunks.length,
          query
        };

      } catch (error) {
        return { error: `Search failed: ${error.message}` };
      }
    },

    async _getFullPdfText(pdfId, includeImages = true, includePageNumbers = true) {
      try {
        // Get PDF metadata (which now contains the full text)
        let metadata;
        if (loadedPdfs.has(pdfId)) {
          metadata = loadedPdfs.get(pdfId).metadata;
        } else {
          metadata = await storage.getMetadata(pdfId);
        }

        if (!metadata || !metadata.fullText) {
          return { error: 'PDF not found or has no content' };
        }

        let result = metadata.fullText;

        // If we need to include images or page numbers, format the text appropriately
        if (includeImages || includePageNumbers) {
          const pageContents = metadata.pageContents || [];
          let formattedText = '';
          
          for (let i = 0; i < pageContents.length; i++) {
            const page = pageContents[i];
            
            // Add page number markers if requested
            if (includePageNumbers) {
              formattedText += `\n\n--- Page ${page.pageNum} ---\n`;
            }
            
            // Add page text
            formattedText += page.text;
            
            // Add image descriptions if requested
            if (includeImages && page.images && page.images.length > 0) {
              formattedText += '\n\n[Images on this page:\n';
              for (const image of page.images) {
                formattedText += `- ${image.description}\n`;
              }
              formattedText += ']\n';
            }
            
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
            processedAt: metadata.processedAt
          }
        };

      } catch (error) {
        return { error: `Failed to get full text: ${error.message}` };
      }
    }
  };
}

module.exports = createPdfLoaderModule;
