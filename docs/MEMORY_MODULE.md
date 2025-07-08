WarpMind Memory API
====================

## 🚧 IMPLEMENTATION PLAN

### Phase 1: Core Memory Module Structure
- [ ] **Add `embed()` method to core WarpMind class** (`src/warpmind.js`)
  - [ ] Call `/embeddings` API endpoint with configurable model (default: `text-embedding-3-small`)
  - [ ] Handle authentication and error cases consistently with other API methods
  - [ ] Return normalized vector array for semantic similarity calculations
- [ ] Create `src/modules/memory.js` with factory pattern matching other modules
- [ ] Add memory methods to main WarpMind class via module mixing
- [ ] Set up IndexedDB wrapper for browser storage
- [ ] Implement UUID generation for memory IDs

### Phase 2: Basic Storage & Retrieval  
- [ ] Implement `remember(data, options?)` method
  - [ ] Handle both string and JSON object inputs
  - [ ] Generate embeddings using `this.embed()` method from core WarpMind
  - [ ] Implement fallback to keyword search if `embed()` fails
  - [ ] Store in IndexedDB with metadata (id, content, embedding?, rawData, tags, timestamp)
- [ ] Implement `forget(id)` method for deletion
- [ ] Implement `getMemories(options?)` for listing/filtering

### Phase 3: Semantic Search
- [ ] Implement `recall(prompt, options?)` method
  - [ ] Generate embedding for search prompt using `this.embed()` method
  - [ ] Calculate cosine similarity with stored memory embeddings
  - [ ] Fallback to keyword/TF-IDF search if no embeddings available
  - [ ] Return sorted results by relevance score
- [ ] Add filtering by tags, timestamps, and limits

### Phase 4: Integration & Testing
- [ ] Create comprehensive test suite (`tests/memory.test.js`)
- [ ] Add browser example demonstrating memory functionality
- [ ] Update main test suite to include memory tests
- [ ] Add memory module to webpack build

### Phase 5: Documentation & Polish
- [ ] Update README.md with memory API documentation
- [ ] Add JSDoc comments to all memory methods
- [ ] Create example use cases (chat with memory, note-taking app)
- [ ] Performance optimization for large memory sets

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