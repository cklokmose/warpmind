WarpMind Memory API
====================

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
- Works offline and persists across sessions.
- Memory is private to the current app unless explicitly exported or synced.