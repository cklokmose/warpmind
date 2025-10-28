/**
 * Tests for Responses API functionality
 * Tests: respond(), streamRespond(), createConversation(), response management
 */

const WarpMind = require('../src/warpmind.js');

// Test configuration
const TEST_CONFIG = {
  baseURL: process.env.BASE_URL || 'https://api.openai.com',
  apiKey: process.env.API_KEY || '',
  model: process.env.MODEL || 'gpt-4o-mini'
};

describe('Responses API - Basic respond()', () => {
  let mind;

  beforeEach(() => {
    mind = new WarpMind(TEST_CONFIG);
  });

  test('should send a simple string message', async () => {
    const response = await mind.respond('Say "test successful" and nothing else');
    
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('usage');
    expect(typeof response.text).toBe('string');
    expect(response.text.length).toBeGreaterThan(0);
    expect(response.id).toMatch(/^resp_/);
  }, 30000);

  test('should accept instructions parameter', async () => {
    const response = await mind.respond('What should I do?', {
      instructions: 'Always respond with "Follow the instructions"'
    });
    
    expect(response.text).toContain('instruction');
  }, 30000);

  test('should support previous_response_id chaining', async () => {
    const first = await mind.respond('Remember the number 42');
    expect(first.id).toBeDefined();
    
    const second = await mind.respond('What number did I just tell you?', {
      previous_response_id: first.id
    });
    
    expect(second.text).toContain('42');
  }, 60000);

  test('should accept array of messages (Chat Completions format)', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Say hello' }
    ];
    
    const response = await mind.respond(messages);
    expect(response.text).toBeTruthy();
    expect(response.text.toLowerCase()).toContain('hello');
  }, 30000);
});

describe('Responses API - Tool Calling', () => {
  let mind;

  beforeEach(() => {
    mind = new WarpMind(TEST_CONFIG);
    
    // Register a simple test tool
    mind.registerTool(
      'get_weather',
      async (args) => {
        return {
          temperature: 22,
          condition: 'sunny',
          location: args.location
        };
      },
      {
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City name'
            }
          },
          required: ['location']
        }
      }
    );
  });

  test('should execute registered tools automatically', async () => {
    const response = await mind.respond('What is the weather in London?');
    
    expect(response.text).toBeTruthy();
    expect(response.text.toLowerCase()).toContain('london');
    // Should contain weather information
    expect(
      response.text.includes('22') || 
      response.text.includes('sunny') || 
      response.text.includes('weather')
    ).toBe(true);
  }, 60000);
});

describe('Responses API - Streaming', () => {
  let mind;

  beforeEach(() => {
    mind = new WarpMind(TEST_CONFIG);
  });

  test('should stream response chunks', async () => {
    const chunks = [];
    
    const response = await mind.streamRespond(
      'Count from 1 to 5 slowly',
      (event) => {
        if (event.delta) {
          chunks.push(event.delta);
        }
      }
    );
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(response.text).toBeTruthy();
    expect(response.id).toMatch(/^resp_/);
    
    // Chunks should combine to full text
    const combinedChunks = chunks.join('');
    expect(combinedChunks).toBe(response.text);
  }, 30000);

  test('should handle streaming with instructions', async () => {
    let chunkCount = 0;
    
    const response = await mind.streamRespond(
      'Tell me a fact',
      (event) => {
        if (event.delta) {
          chunkCount++;
        }
      },
      {
        instructions: 'Be concise'
      }
    );
    
    expect(chunkCount).toBeGreaterThan(0);
    expect(response.text).toBeTruthy();
  }, 30000);
});

describe('Responses API - Conversation', () => {
  let mind;
  let conversation;

  beforeEach(() => {
    mind = new WarpMind(TEST_CONFIG);
    conversation = mind.createConversation({
      instructions: 'You are a helpful assistant. Keep track of what the user tells you.'
    });
  });

  test('should create a conversation instance', () => {
    expect(conversation).toBeDefined();
    expect(typeof conversation.respond).toBe('function');
    expect(typeof conversation.streamRespond).toBe('function');
    expect(typeof conversation.getHistory).toBe('function');
  });

  test('should maintain conversation context', async () => {
    const first = await conversation.respond('My name is Alice');
    expect(first.text).toBeTruthy();
    
    const second = await conversation.respond('What is my name?');
    expect(second.text.toLowerCase()).toContain('alice');
    
    expect(conversation.getHistory().length).toBeGreaterThan(0);
  }, 60000);

  test('should export and import conversation history', async () => {
    await conversation.respond('Remember the number 123');
    
    const exported = conversation.exportHistory();
    expect(exported).toBeTruthy();
    expect(typeof exported).toBe('string');
    
    // Create new conversation and import
    const newConversation = mind.createConversation();
    newConversation.importHistory(exported);
    
    expect(newConversation.getHistory().length).toBe(conversation.getHistory().length);
    expect(newConversation.previousResponseId).toBe(conversation.previousResponseId);
  }, 30000);

  test('should clear conversation history', async () => {
    await conversation.respond('Hello');
    expect(conversation.getHistory().length).toBeGreaterThan(0);
    
    await conversation.clear();
    expect(conversation.getHistory().length).toBe(0);
    expect(conversation.previousResponseId).toBeNull();
  }, 30000);

  test('should support streaming in conversations', async () => {
    let chunks = [];
    
    const response = await conversation.streamRespond(
      'Count from 1 to 3',
      (event) => {
        if (event.delta) {
          chunks.push(event.delta);
        }
      }
    );
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(response.text).toBeTruthy();
    expect(conversation.getHistory().length).toBeGreaterThan(0);
  }, 30000);
});

describe('Responses API - Response Management', () => {
  let mind;

  beforeEach(() => {
    mind = new WarpMind(TEST_CONFIG);
  });

  test('should retrieve a response by ID', async () => {
    const response = await mind.respond('Say hello', { store: true });
    expect(response.id).toBeDefined();
    
    // Retrieve the same response
    const retrieved = await mind.getResponse(response.id);
    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe(response.id);
  }, 30000);

  test('should handle background responses with polling', async () => {
    const responseId = await mind.respondBackground('Count to 10 slowly');
    expect(responseId).toMatch(/^resp_/);
    
    // Poll until complete
    const result = await mind.pollUntilComplete(responseId, {
      maxWaitMs: 60000,
      initialDelayMs: 1000
    });
    
    expect(result.status).toBe('completed');
    expect(result.output).toBeDefined();
  }, 90000);
});

describe('Responses API - Backward Compatibility', () => {
  let mind;

  beforeEach(() => {
    mind = new WarpMind(TEST_CONFIG);
  });

  test('should not break existing chat() method', async () => {
    const response = await mind.chat([
      { role: 'user', content: 'Say "old API works"' }
    ]);
    
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    expect(response.toLowerCase()).toContain('old api');
  }, 30000);

  test('should not break existing streamChat() method', async () => {
    let text = '';
    
    await mind.streamChat(
      [{ role: 'user', content: 'Count to 3' }],
      (event) => {
        if (event.type === 'chunk') {
          text += event.content;
        }
      }
    );
    
    expect(text).toBeTruthy();
  }, 30000);

  test('should not break existing tool registration', async () => {
    mind.registerTool(
      'test_tool',
      async () => ({ success: true }),
      {
        description: 'Test tool',
        parameters: { type: 'object', properties: {} }
      }
    );
    
    expect(mind._tools.length).toBeGreaterThan(0);
    
    // Should work with both APIs
    const chatResponse = await mind.chat([
      { role: 'user', content: 'Use test_tool' }
    ]);
    expect(chatResponse).toBeTruthy();
    
    const respondResponse = await mind.respond('Use test_tool');
    expect(respondResponse.text).toBeTruthy();
  }, 60000);
});
