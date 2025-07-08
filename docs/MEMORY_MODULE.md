WarpMind Memory API
====================

## 🚧 IMPLEMENTATION PLAN

### Phase 1: Core Memory Module Structure
- [x] **Add `embed()` method to core WarpMind class** (`src/warpmind.js`)
  - [x] Call `/embeddings` API endpoint with configurable model (default: `text-embedding-3-small`)
  - [x] Handle authentication and error cases consistently with other API methods
  - [x] Return normalized vector array for semantic similarity calculations
- [x] Create `src/modules/memory.js` with factory pattern matching other modules
- [x] Add memory methods to main WarpMind class via module mixing
- [x] Set up IndexedDB wrapper for browser storage
- [x] Implement UUID generation for memory IDs

### Phase 2: Basic Storage & Retrieval  
- [x] Implement `remember(data, options?)` method
  - [x] Handle both string and JSON object inputs
  - [x] Generate embeddings using `this.embed()` method from core WarpMind
  - [x] Implement fallback to keyword search if `embed()` fails
  - [x] Store in IndexedDB with metadata (id, content, embedding?, rawData, tags, timestamp)
- [x] Implement `forget(id)` method for deletion
- [x] Implement `getMemories(options?)` for listing/filtering

### Phase 3: Semantic Search
- [x] Implement `recall(prompt, options?)` method
  - [x] Generate embedding for search prompt using `this.embed()` method
  - [x] Calculate cosine similarity with stored memory embeddings
  - [x] Fallback to keyword/TF-IDF search if no embeddings available
  - [x] Return sorted results by relevance score
- [x] Add filtering by tags, timestamps, and limits

### Phase 4: Integration & Testing
- [x] Create comprehensive test suite (integrated in `tests/node-api-test.js`)
- [x] Add browser example demonstrating memory functionality
- [x] Update main test suite to include memory tests
- [x] Add memory module to webpack build
- [x] Add import/export functionality tests

### Phase 5: Documentation & Polish
- [x] Update README.md with memory API documentation
- [x] Add JSDoc comments to all memory methods
- [x] Create example use cases (chat with memory, note-taking app)
- [ ] Performance optimization for large memory sets

### Phase 6: Import/Export Features
- [x] Implement `exportMemories(options?)` method for data portability
- [x] Implement `importMemories(data, options?)` method for data import
- [x] Add import/export to demo interface
- [x] Document import/export functionality
- [x] Add import/export tests to test suite

### Technical Notes:
- **Core Integration**: Memory module uses `this.embed()` method from core WarpMind class
- **Embedding API**: Core `embed()` method calls `/embeddings` endpoint with configurable model
- **Fallback Strategy**: If embeddings unavailable, use simple keyword/TF-IDF search as fallback
- **Storage**: IndexedDB for persistence, fallback to localStorage if needed
- **Search**: Cosine similarity for vector search (simple dot product implementation)
- **Format**: Store memories as `{ id, content, embedding?, rawData?, tags?, timestamp }`

---

This API lets you store, search, and delete memory in your browser using local storage (IndexedDB).
It supports both plain text and JSON, and uses vector embeddings to find semantically related memories.

---

remember(data, options?)
-------------------------

Store a memory.

- data: A string or JSON object.
- options.tags: Optional list of tags (e.g. ["profile", "meeting"]).

Returns a memory ID (string) that can be used to recall or delete the memory.

Example:
const id1 = await mind.remember("Clemens lives in Aarhus.");
const id2 = await mind.remember({ name: "Clemens", city: "Aarhus" }, { tags: ["profile"] });

---

recall(prompt, options?)
-------------------------

Find memories relevant to a prompt using vector similarity.

- prompt: A question or phrase (e.g. "Where does Clemens live?")
- options.limit: Maximum number of results (default is 5)
- options.tags: Only search among memories with specific tags

Returns an array of memory objects sorted by relevance.

Example:
const results = await mind.recall("Where does Clemens live?");

---

getMemories(options?)
----------------------

List all or filtered memories.

- options.prompt: Only include memories similar to this prompt
- options.tags: Only include memories with specific tags
- options.after: Only include memories created after this timestamp (ms)
- options.before: Only include memories created before this timestamp (ms)
- options.limit: Limit the number of results

Returns an array of memory objects.

Example:
const all = await mind.getMemories();
const filtered = await mind.getMemories({ tags: ["meeting"] });

---

forget(id)
----------

Delete a memory by its ID.

- id: The string ID returned by remember(...)

Example:
await mind.forget("cb29af27-...");

---

exportMemories(options?)
------------------------

Export memories to a JSON format for backup or transfer.

- options.tags: Only export memories with specific tags
- options.after: Only export memories created after this timestamp (ms)
- options.before: Only export memories created before this timestamp (ms)
- options.includeEmbeddings: Include embedding vectors in export (default: false)

Returns a JSON-serializable object containing the exported memories and metadata.

Example:
const backup = await mind.exportMemories();
const workMemories = await mind.exportMemories({ tags: ["work"] });

---

importMemories(data, options?)
------------------------------

Import memories from a previously exported JSON format.

- data: The exported data object (from exportMemories) or JSON string
- options.merge: If true, merge with existing memories; if false, replace all (default: true)
- options.skipDuplicates: Skip memories with duplicate content (default: true)
- options.regenerateEmbeddings: Regenerate embeddings for imported memories (default: true)

Returns an object with import statistics: { imported: number, skipped: number, errors: string[] }

Example:
const result = await mind.importMemories(backupData);
console.log(`Imported ${result.imported} memories, skipped ${result.skipped}`);

---

## Import/Export Functionality

The WarpMind memory module provides robust import and export capabilities for backing up, transferring, and managing memory data.

### Export Format

The export format is a structured JSON object containing:

```json
{
  "version": "1.0",
  "exportedAt": "2025-07-08T10:30:00.000Z",
  "source": "WarpMind Memory Module",
  "options": {
    "includeEmbeddings": false,
    "filters": {
      "tags": ["work", "important"],
      "after": 1625097600000,
      "before": 1625184000000
    }
  },
  "memories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "content": "Meeting notes from project review",
      "rawData": null,
      "tags": ["work", "meeting"],
      "timestamp": 1625140800000
    }
  ],
  "count": 1
}
```

### Export Options

```javascript
await mind.exportMemories({
  tags: ['work'],              // Only export memories with these tags
  after: Date.now() - 86400000, // Only memories from last 24 hours
  before: Date.now(),          // Only memories before now
  includeEmbeddings: false     // Whether to include embedding vectors (increases file size)
});
```

### Import Options

```javascript
await mind.importMemories(exportData, {
  merge: true,                 // Merge with existing (true) or replace all (false)
  skipDuplicates: true,        // Skip memories with identical content
  regenerateEmbeddings: true   // Generate new embeddings vs using existing ones
});
```

### Import Statistics

The `importMemories` method returns detailed statistics:

```javascript
const stats = await mind.importMemories(data);
console.log(stats);
// {
//   imported: 15,      // Successfully imported memories
//   skipped: 3,        // Skipped due to duplicates
//   errors: [          // Array of error messages
//     "Failed to import memory 'xyz': Invalid format"
//   ]
// }
```

### Use Cases

1. **Backup and Restore**: Export memories for backup, restore on new device
2. **Data Migration**: Move memories between different applications
3. **Selective Transfer**: Export only work-related memories for team sharing
4. **Development**: Export test data, import for consistent testing

### Best Practices

- **Regular Backups**: Export memories periodically to prevent data loss
- **Selective Exports**: Use tag filtering to export only relevant memories
- **Embedding Management**: Set `includeEmbeddings: false` for smaller files, `regenerateEmbeddings: true` for fresh embeddings
- **Error Handling**: Always check import statistics for errors and handle appropriately

---

Memory Object Format
--------------------

Returned by recall() and getMemories():

{
  id: string           // unique ID
  content: string      // text version used for embedding & recall
  rawData?: object     // original JSON object, if stored that way
  tags?: string[]      // optional tags
  timestamp: number    // creation time (ms since epoch)
}

---

Notes
-----

- All data is stored locally using IndexedDB.
- Memory is private to the current app unless explicitly exported or synced.