/**
 * Vision module for WarpMind - Contains all image analysis operations
 * Handles image uploads, analysis, and multi-modal conversations
 */

// Import required utilities
let fileToBase64;

if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  const { fileToBase64: fBase64 } = require('../util.js');
  fileToBase64 = fBase64;
} else {
  // Browser environment - utilities should be available globally
  fileToBase64 = window.WarpmindUtils.fileToBase64;
}

/**
 * Vision module factory function that accepts a client instance
 * @param {Object} client - The client instance (BaseClient or Warpmind)
 * @returns {Object} - Object with vision methods to be mixed into the main class
 */
function createVisionModule(client) {
  return {
    /**
     * Analyze images using vision models
     * @param {string|File|Blob} image - Image to analyze (URL, File, or Blob)
     * @param {string} prompt - Question or instruction about the image
     * @param {Object} options - Optional parameters
     * @param {string} options.model - Vision model to use (default: 'gpt-4o')
     * @param {string} options.detail - Image detail level: "low" or "high" (default: "low")
     * @param {number} options.timeoutMs - Request timeout in milliseconds
     * @returns {Promise<Object>} - AI response object with image analysis
     */
    async analyzeImage(image, prompt = "What do you see in this image?", options = {}) {
      let imageContent;
      const detail = options.detail || "low";
      
      // Validate detail parameter
      if (detail !== "low" && detail !== "high") {
        throw new Error('options.detail must be "low" or "high"');
      }

      // Handle different image input types
      if (typeof image === 'string') {
        // URL or base64 string
        if (image.startsWith('data:image/')) {
          imageContent = {
            type: "image_url",
            image_url: {
              url: image,
              detail: detail
            }
          };
        } else {
          imageContent = {
            type: "image_url",
            image_url: {
              url: image,
              detail: detail
            }
          };
        }
      } else if (image && (
        (typeof File !== 'undefined' && image instanceof File) || 
        (typeof Blob !== 'undefined' && image instanceof Blob) ||
        (image.constructor && image.constructor.name === 'File') ||
        (image.constructor && image.constructor.name === 'Blob') ||
        (image.type && image.arrayBuffer) // Duck typing for File/Blob-like objects
      )) {
        // Convert File/Blob to base64
        const base64 = await fileToBase64(image);
        imageContent = {
          type: "image_url",
          image_url: {
            url: base64,
            detail: detail
          }
        };
      } else {
        throw new Error('Image must be a URL string, File, or Blob object');
      }

      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            imageContent
          ]
        }
      ];

      return await client.chat(messages, { 
        model: options.model || 'gpt-4o',
        ...options 
      });
    }
  };
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = createVisionModule;
} else if (typeof window !== 'undefined') {
  // Browser environment - attach to window for global access
  window.createVisionModule = createVisionModule;
}
