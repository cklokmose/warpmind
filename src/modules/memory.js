/**
 * Memory module for WarpMind - Contains all memory storage and retrieval operations
 * Includes semantic search using embeddings and fallback keyword search
 */

// Import required utilities
let createTimeoutController, TimeoutError;

if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  const { createTimeoutController: ctc } = require('../util.js');
  const { TimeoutError: te } = require('../core/base-client.js');
  createTimeoutController = ctc;
  TimeoutError = te;
} else {
  // Browser environment - utilities should be available globally
  createTimeoutController = window.createTimeoutController;
  TimeoutError = window.TimeoutError;
}

/**
 * Simple UUID v4 generator
 * @returns {string} - UUID string
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Storage wrapper for memory - uses IndexedDB (browser) or in-memory storage (Node.js)
 */
class MemoryStore {
  constructor() {
    this.dbName = 'warpMindMemory';
    this.dbVersion = 1;
    this.storeName = 'memories';
    this.db = null;
    
    // For Node.js environments - use in-memory storage
    this.isNode = typeof indexedDB === 'undefined';
    this.memoryData = new Map(); // In-memory storage for Node.js
  }

  /**
   * Initialize the storage (IndexedDB or in-memory)
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isNode) {
      // Node.js environment - no initialization needed for in-memory storage
      return Promise.resolve();
    }

    // Browser environment - use IndexedDB
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create memories object store
        const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
        
        // Create indexes for efficient querying
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      };
    });
  }

  /**
   * Store a memory object
   * @param {Object} memory - The memory object to store
   * @returns {Promise<void>}
   */
  async store(memory) {
    if (this.isNode) {
      // Node.js - use in-memory storage
      this.memoryData.set(memory.id, memory);
      return Promise.resolve();
    }
    
    // Browser - use IndexedDB
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(memory);

      request.onerror = () => reject(new Error('Failed to store memory'));
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Retrieve a memory by ID
   * @param {string} id - The memory ID
   * @returns {Promise<Object|null>} - The memory object or null if not found
   */
  async get(id) {
    if (this.isNode) {
      // Node.js - use in-memory storage
      return Promise.resolve(this.memoryData.get(id) || null);
    }
    
    // Browser - use IndexedDB
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(new Error('Failed to retrieve memory'));
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Delete a memory by ID
   * @param {string} id - The memory ID
   * @returns {Promise<void>}
   */
  async delete(id) {
    if (this.isNode) {
      // Node.js - use in-memory storage
      this.memoryData.delete(id);
      return Promise.resolve();
    }
    
    // Browser - use IndexedDB
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(new Error('Failed to delete memory'));
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get all memories with optional filtering
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of memory objects
   */
  async getAll(options = {}) {
    if (this.isNode) {
      // Node.js - use in-memory storage
      let memories = Array.from(this.memoryData.values());
      
      // Apply filters
      if (options.tags && options.tags.length > 0) {
        memories = memories.filter(memory => 
          memory.tags && memory.tags.some(tag => options.tags.includes(tag))
        );
      }
      
      if (options.after) {
        memories = memories.filter(memory => memory.timestamp > options.after);
      }
      
      if (options.before) {
        memories = memories.filter(memory => memory.timestamp < options.before);
      }
      
      return Promise.resolve(memories);
    }
    
    // Browser - use IndexedDB
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(new Error('Failed to retrieve memories'));
      request.onsuccess = () => {
        let memories = request.result || [];
        
        // Apply filters
        if (options.tags && options.tags.length > 0) {
          memories = memories.filter(memory => 
            memory.tags && memory.tags.some(tag => options.tags.includes(tag))
          );
        }
        
        if (options.after) {
          memories = memories.filter(memory => memory.timestamp > options.after);
        }
        
        if (options.before) {
          memories = memories.filter(memory => memory.timestamp < options.before);
        }
        
        // Sort by timestamp (newest first)
        memories.sort((a, b) => b.timestamp - a.timestamp);
        
        // Apply limit
        if (options.limit && options.limit > 0) {
          memories = memories.slice(0, options.limit);
        }
        
        resolve(memories);
      };
    });
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number} - Similarity score between 0 and 1
 */
function cosineSimilarity(vectorA, vectorB) {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Simple keyword search as fallback
 * @param {string} query - Search query
 * @param {Array} memories - Array of memory objects
 * @returns {Array} - Sorted array of memories with relevance scores
 */
function keywordSearch(query, memories) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  
  const scoredMemories = memories.map(memory => {
    const content = memory.content.toLowerCase();
    const tags = (memory.tags || []).map(tag => tag.toLowerCase()).join(' ');
    const searchableText = content + ' ' + tags;
    
    let score = 0;
    
    queryWords.forEach(word => {
      const wordCount = (searchableText.match(new RegExp(word, 'g')) || []).length;
      score += wordCount;
    });
    
    return { ...memory, relevanceScore: score };
  });
  
  return scoredMemories
    .filter(memory => memory.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Memory module factory function that accepts a client instance
 * @param {Object} client - The client instance (BaseClient or WarpMind)
 * @returns {Object} - Object with memory methods to be mixed into the main class
 */
function createMemoryModule(client) {
  const memoryStore = new MemoryStore();

  // Register the memory recall tool if the client supports tools and it's enabled
  if (client.registerTool && typeof client.registerTool === 'function' && 
      client._memoryToolConfig && client._memoryToolConfig.enabled) {
    
    const memoryTool = {
      name: "recall_memory",
      description: "Search for relevant memories when the user explicitly asks to remember or recall information. Only use this tool when the user specifically mentions remembering, recalling, or accessing stored information. Do not use for general knowledge questions or current conversation context.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find relevant memories"
          },
          limit: {
            type: "number",
            description: `Maximum number of memories to retrieve (default: ${client._memoryToolConfig.maxResults})`,
            default: client._memoryToolConfig.maxResults
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags to filter memories"
          }
        },
        required: ["query"]
      },
      handler: async (args) => {
        const { query, limit = client._memoryToolConfig.maxResults, tags } = args;
        
        try {
          const memories = await client.recall(query, { limit, tags });
          
          if (memories.length === 0) {
            return "No relevant memories found for the query.";
          }
          
          return memories.map(memory => ({
            content: memory.content,
            tags: memory.tags || [],
            timestamp: new Date(memory.timestamp).toLocaleString(),
            relevanceScore: memory.relevanceScore
          }));
        } catch (error) {
          return `Error accessing memories: ${error.message}`;
        }
      }
    };

    // Register the tool
    try {
      client.registerTool(memoryTool);
    } catch (error) {
      console.warn('Failed to register memory tool:', error.message);
    }
  } else if (client.unregisterTool && typeof client.unregisterTool === 'function') {
    // Ensure tool is unregistered if disabled
    client.unregisterTool("recall_memory");
  }

  return {
    /**
     * Store a memory with optional tags
     * @param {string|Object} data - The data to remember (string or JSON object)
     * @param {Object} options - Optional parameters
     * @param {string[]} options.tags - Optional tags for categorization
     * @returns {Promise<string>} - The memory ID
     */
    async remember(data, options = {}) {
      if (!data) {
        throw new Error('Data is required to create a memory');
      }

      const id = generateUUID();
      const timestamp = Date.now();
      
      // Convert data to content string for embedding
      let content, rawData;
      if (typeof data === 'string') {
        content = data;
      } else {
        content = JSON.stringify(data);
        rawData = data;
      }

      const memory = {
        id,
        content,
        rawData,
        tags: options.tags || [],
        timestamp
      };

      // Try to generate embedding
      try {
        const embedding = await client.embed(content);
        memory.embedding = embedding;
      } catch (error) {
        console.warn('Failed to generate embedding for memory:', error.message);
        // Continue without embedding (will use keyword search as fallback)
      }

      await memoryStore.store(memory);
      return memory; // Return the complete memory object instead of just the ID
    },

    /**
     * Recall memories relevant to a prompt using semantic similarity
     * @param {string} prompt - The search prompt
     * @param {Object} options - Optional parameters
     * @param {number} options.limit - Maximum number of results (default: 5)
     * @param {string[]} options.tags - Filter by specific tags
     * @returns {Promise<Array>} - Array of relevant memory objects sorted by relevance
     */
    async recall(prompt, options = {}) {
      if (!prompt || typeof prompt !== 'string') {
        throw new Error('Prompt is required and must be a string');
      }

      const limit = options.limit || 5;
      const memories = await memoryStore.getAll({ tags: options.tags });
      
      if (memories.length === 0) {
        return [];
      }

      try {
        // Try semantic search with embeddings
        const promptEmbedding = await client.embed(prompt);
        
        const memoriesWithEmbeddings = memories.filter(memory => memory.embedding);
        
        if (memoriesWithEmbeddings.length === 0) {
          // Fall back to keyword search
          return keywordSearch(prompt, memories).slice(0, limit);
        }

        const scoredMemories = memoriesWithEmbeddings.map(memory => ({
          ...memory,
          relevanceScore: cosineSimilarity(promptEmbedding, memory.embedding)
        }));

        return scoredMemories
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, limit)
          .map(memory => {
            const { embedding, ...memoryWithoutEmbedding } = memory;
            return memoryWithoutEmbedding;
          });

      } catch (error) {
        console.warn('Semantic search failed, falling back to keyword search:', error.message);
        return keywordSearch(prompt, memories).slice(0, limit);
      }
    },

    /**
     * Get all memories with optional filtering
     * @param {Object} options - Filter options
     * @param {string} options.prompt - Filter by similarity to this prompt
     * @param {string[]} options.tags - Filter by specific tags
     * @param {number} options.after - Only include memories created after this timestamp
     * @param {number} options.before - Only include memories created before this timestamp
     * @param {number} options.limit - Limit the number of results
     * @returns {Promise<Array>} - Array of memory objects
     */
    async getMemories(options = {}) {
      if (options.prompt) {
        // Use recall for prompt-based filtering
        return await this.recall(options.prompt, {
          limit: options.limit,
          tags: options.tags
        });
      }

      const memories = await memoryStore.getAll(options);
      
      return memories.map(memory => {
        const { embedding, ...memoryWithoutEmbedding } = memory;
        return memoryWithoutEmbedding;
      });
    },

    /**
     * Delete a memory by its ID
     * @param {string} id - The memory ID to delete
     * @returns {Promise<void>}
     */
    async forget(id) {
      if (!id || typeof id !== 'string') {
        throw new Error('Memory ID is required and must be a string');
      }

      await memoryStore.delete(id);
    },

    /**
     * Export memories to a JSON format for backup or transfer
     * @param {Object} options - Optional parameters
     * @param {string[]} options.tags - Only export memories with specific tags
     * @param {number} options.after - Only export memories created after this timestamp (ms)
     * @param {number} options.before - Only export memories created before this timestamp (ms)
     * @param {boolean} options.includeEmbeddings - Include embedding vectors in export (default: false)
     * @returns {Promise<Object>} - Export data object
     */
    async exportMemories(options = {}) {
      const memories = await memoryStore.getAll(options);
      
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        source: 'WarpMind Memory Module',
        options: {
          includeEmbeddings: options.includeEmbeddings || false,
          filters: {
            tags: options.tags,
            after: options.after,
            before: options.before
          }
        },
        memories: memories.map(memory => {
          const exported = { ...memory };
          
          // Remove embedding unless specifically requested
          if (!options.includeEmbeddings && exported.embedding) {
            delete exported.embedding;
          }
          
          return exported;
        }),
        count: memories.length
      };
      
      return exportData;
    },

    /**
     * Export memories to a downloadable JSON file (browser only)
     * @param {Object} options - Export options (same as exportMemories)
     * @param {string} options.filename - Optional filename (default: 'warpmind-memories-YYYY-MM-DD.json')
     * @returns {Promise<Object>} - Export stats and data
     */
    async exportMemoriesToFile(options = {}) {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('exportMemoriesToFile() is only available in browser environments. Use exportMemories() in Node.js.');
      }

      // Generate the export data
      const exportData = await this.exportMemories(options);
      
      // Generate filename if not provided
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = options.filename || `warpmind-memories-${dateStr}.json`;
      
      // Create and trigger download
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create temporary download link
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = filename;
      downloadLink.style.display = 'none';
      
      // Trigger download
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up the object URL
      URL.revokeObjectURL(url);
      
      return {
        exported: exportData.count,
        filename: filename,
        size: new Blob([jsonString]).size,
        data: exportData
      };
    },

    /**
     * Import memories from a previously exported JSON format
     * @param {Object|string} data - The exported data object or JSON string
     * @param {Object} options - Optional parameters
     * @param {boolean} options.merge - If true, merge with existing; if false, replace all (default: true)
     * @param {boolean} options.skipDuplicates - Skip memories with duplicate content (default: true)
     * @param {boolean} options.regenerateEmbeddings - Regenerate embeddings for imported memories (default: true)
     * @returns {Promise<Object>} - Import statistics: { imported: number, skipped: number, errors: string[] }
     */
    async importMemories(data, options = {}) {
      const {
        merge = true,
        skipDuplicates = true,
        regenerateEmbeddings = true
      } = options;

      // Parse data if it's a string
      let importData;
      try {
        importData = typeof data === 'string' ? JSON.parse(data) : data;
      } catch (error) {
        throw new Error('Invalid import data format: ' + error.message);
      }

      // Validate import data structure
      if (!importData.memories || !Array.isArray(importData.memories)) {
        throw new Error('Import data must contain a "memories" array');
      }

      const stats = {
        imported: 0,
        skipped: 0,
        errors: []
      };

      // Get existing memories for duplicate checking
      let existingMemories = [];
      if (skipDuplicates) {
        existingMemories = await memoryStore.getAll();
      }

      // Clear all memories if not merging
      if (!merge) {
        const allMemories = await memoryStore.getAll();
        for (const memory of allMemories) {
          await memoryStore.delete(memory.id);
        }
      }

      // Process each memory for import
      for (const memoryData of importData.memories) {
        try {
          // Check for duplicates by content
          if (skipDuplicates) {
            const isDuplicate = existingMemories.some(existing => 
              existing.content === memoryData.content
            );
            if (isDuplicate) {
              stats.skipped++;
              continue;
            }
          }

          // Prepare memory for storage
          const memory = {
            id: memoryData.id || generateUUID(), // Use existing ID or generate new one
            content: memoryData.content,
            rawData: memoryData.rawData,
            tags: memoryData.tags || [],
            timestamp: memoryData.timestamp || Date.now()
          };

          // Handle embeddings
          if (regenerateEmbeddings) {
            // Generate new embedding
            try {
              const embedding = await client.embed(memory.content);
              memory.embedding = embedding;
            } catch (error) {
              console.warn('Failed to generate embedding for imported memory:', error);
              memory.embedding = null;
            }
          } else if (memoryData.embedding) {
            // Use existing embedding if available
            memory.embedding = memoryData.embedding;
          } else {
            memory.embedding = null;
          }

          await memoryStore.store(memory);
          stats.imported++;

        } catch (error) {
          stats.errors.push(`Failed to import memory "${memoryData.content?.slice(0, 50)}...": ${error.message}`);
        }
      }

      return stats;
    },

    /**
     * Import memories from a file using browser file picker (browser only)
     * @param {Object} options - Import options (same as importMemories)
     * @returns {Promise<Object>} - Import statistics: { imported: number, skipped: number, errors: string[] }
     */
    async importMemoriesFromFile(options = {}) {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('importMemoriesFromFile() is only available in browser environments. Use importMemories() in Node.js.');
      }

      return new Promise((resolve, reject) => {
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';
        
        // Handle file selection
        fileInput.onchange = async (event) => {
          try {
            const file = event.target.files[0];
            if (!file) {
              reject(new Error('No file selected'));
              return;
            }
            
            // Validate file type
            if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
              reject(new Error('Please select a JSON file (.json)'));
              return;
            }
            
            // Read file content
            const fileContent = await new Promise((fileResolve, fileReject) => {
              const reader = new FileReader();
              reader.onload = (e) => fileResolve(e.target.result);
              reader.onerror = () => fileReject(new Error('Failed to read file'));
              reader.readAsText(file);
            });
            
            // Parse and import the JSON data
            let importData;
            try {
              importData = JSON.parse(fileContent);
            } catch (parseError) {
              reject(new Error(`Invalid JSON file: ${parseError.message}`));
              return;
            }
            
            // Import the memories using existing importMemories method
            const stats = await this.importMemories(importData, options);
            
            // Clean up file input
            document.body.removeChild(fileInput);
            
            resolve({
              ...stats,
              filename: file.name,
              fileSize: file.size
            });
            
          } catch (error) {
            // Clean up file input on error
            if (document.body.contains(fileInput)) {
              document.body.removeChild(fileInput);
            }
            reject(error);
          }
        };
        
        // Handle dialog cancellation
        fileInput.oncancel = () => {
          document.body.removeChild(fileInput);
          reject(new Error('File selection cancelled'));
        };
        
        // Trigger file picker
        document.body.appendChild(fileInput);
        fileInput.click();
      });
    }
  };
}

// Export for both CommonJS and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = createMemoryModule;
} else if (typeof window !== 'undefined') {
  window.createMemoryModule = createMemoryModule;
}
