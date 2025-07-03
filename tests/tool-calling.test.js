/**
 * Tool Calling System Tests
 */

const Warpmind = require('../src/warpmind.js');

describe('Warpmind Tool Calling System', () => {
  let mind;

  beforeEach(() => {
    mind = new Warpmind({ apiKey: 'test-key' });
    
    // Mock the makeRequest method to simulate tool calling responses
    mind.makeRequest = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerTool()', () => {
    it('should register a valid tool successfully', () => {
      const tool = {
        name: 'searchLibrary',
        description: 'Searches school library by title',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title']
        },
        handler: async (args) => ({ books: [`Book about ${args.title}`] })
      };

      expect(() => mind.registerTool(tool)).not.toThrow();
      expect(mind._tools).toHaveLength(1);
      expect(mind._tools[0].schema.function.name).toBe('searchLibrary');
    });

    it('should throw error for invalid tool name', () => {
      expect(() => mind.registerTool({
        name: '',
        description: 'Test',
        parameters: {},
        handler: () => {}
      })).toThrow('Tool name must be a non-empty string');

      expect(() => mind.registerTool({
        description: 'Test',
        parameters: {},
        handler: () => {}
      })).toThrow('Tool name must be a non-empty string');
    });

    it('should throw error for invalid description', () => {
      expect(() => mind.registerTool({
        name: 'test',
        description: '',
        parameters: {},
        handler: () => {}
      })).toThrow('Tool description must be a non-empty string');
    });

    it('should throw error for invalid parameters', () => {
      expect(() => mind.registerTool({
        name: 'test',
        description: 'Test tool',
        parameters: null,
        handler: () => {}
      })).toThrow('Tool parameters must be an object');
    });

    it('should throw error for invalid handler', () => {
      expect(() => mind.registerTool({
        name: 'test',
        description: 'Test tool',
        parameters: {},
        handler: 'not a function'
      })).toThrow('Tool handler must be a function');
    });

    it('should throw error for duplicate tool names', () => {
      const tool = {
        name: 'duplicate',
        description: 'Test tool',
        parameters: {},
        handler: () => {}
      };

      mind.registerTool(tool);
      expect(() => mind.registerTool(tool)).toThrow("Tool with name 'duplicate' is already registered");
    });
  });

  describe('chat() with tools', () => {
    beforeEach(() => {
      // Register a test tool
      mind.registerTool({
        name: 'getWeather',
        description: 'Get weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city']
        },
        handler: async (args) => ({ 
          city: args.city, 
          temperature: '22°C', 
          condition: 'sunny' 
        })
      });
    });

    it('should include tools in request when tools are registered', async () => {
      // Mock response without tool calls
      mind.makeRequest.mockResolvedValue({
        choices: [{ message: { content: 'Hello! How can I help you?' } }]
      });

      await mind.chat('Hello');

      expect(mind.makeRequest).toHaveBeenCalledWith('/chat/completions', 
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              type: 'function',
              function: expect.objectContaining({
                name: 'getWeather',
                description: 'Get weather for a city'
              })
            })
          ]),
          tool_choice: 'auto'
        }),
        expect.any(Object)
      );
    });

    it('should execute tool calls and continue conversation', async () => {
      // First call: AI wants to use a tool
      mind.makeRequest
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'I\'ll check the weather for you.',
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'getWeather',
                  arguments: JSON.stringify({ city: 'London' })
                }
              }]
            }
          }]
        })
        // Second call: AI responds with tool results
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'The weather in London is 22°C and sunny!'
            }
          }]
        });

      const result = await mind.chat('What\'s the weather in London?');

      expect(result).toBe('The weather in London is 22°C and sunny!');
      expect(mind.makeRequest).toHaveBeenCalledTimes(2);

      // Check that tool result was added to messages in second call
      const secondCallArgs = mind.makeRequest.mock.calls[1][1];
      expect(secondCallArgs.messages).toContainEqual({
        role: 'tool',
        tool_call_id: 'call_123',
        content: JSON.stringify({ 
          city: 'London', 
          temperature: '22°C', 
          condition: 'sunny' 
        })
      });
    });

    it('should handle tool execution errors gracefully', async () => {
      // Register a tool that will throw an error
      mind.registerTool({
        name: 'errorTool',
        description: 'A tool that throws an error',
        parameters: { type: 'object', properties: {} },
        handler: async () => {
          throw new Error('Tool error');
        }
      });

      mind.makeRequest
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'I\'ll use the error tool.',
              tool_calls: [{
                id: 'call_error',
                type: 'function',
                function: {
                  name: 'errorTool',
                  arguments: JSON.stringify({})
                }
              }]
            }
          }]
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'There was an error with the tool.'
            }
          }]
        });

      const result = await mind.chat('Use the error tool');

      expect(result).toBe('There was an error with the tool.');

      // Check that error was added to messages
      const secondCallArgs = mind.makeRequest.mock.calls[1][1];
      expect(secondCallArgs.messages).toContainEqual({
        role: 'tool',
        tool_call_id: 'call_error',
        content: JSON.stringify({ error: 'Tool execution failed: Tool error' })
      });
    });

    it('should respect maximum depth limit of 2', async () => {
      // Mock 3 tool call responses to test depth limit
      mind.makeRequest
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'First tool call',
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'getWeather', arguments: '{"city":"Paris"}' }
              }]
            }
          }]
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Second tool call',
              tool_calls: [{
                id: 'call_2',
                type: 'function',
                function: { name: 'getWeather', arguments: '{"city":"Berlin"}' }
              }]
            }
          }]
        })
        // Third call should not include tools (max depth reached)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Final response without tools'
            }
          }]
        });

      const result = await mind.chat('Start tool calling chain');

      expect(result).toBe('Final response without tools');
      expect(mind.makeRequest).toHaveBeenCalledTimes(3);

      // Third call should not include tools due to depth limit
      const thirdCallArgs = mind.makeRequest.mock.calls[2][1];
      expect(thirdCallArgs.tools).toBeUndefined();
    });

    it('should handle multiple tool calls in single response', async () => {
      mind.makeRequest
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'I\'ll check weather for multiple cities.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'getWeather', arguments: '{"city":"London"}' }
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: { name: 'getWeather', arguments: '{"city":"Paris"}' }
                }
              ]
            }
          }]
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Weather checked for both cities!'
            }
          }]
        });

      const result = await mind.chat('Weather for London and Paris');

      expect(result).toBe('Weather checked for both cities!');

      // Should have tool results for both calls
      const secondCallArgs = mind.makeRequest.mock.calls[1][1];
      expect(secondCallArgs.messages.filter(m => m.role === 'tool')).toHaveLength(2);
    });
  });

  describe('chat() without tools', () => {
    it('should work normally when no tools are registered', async () => {
      mind.makeRequest.mockResolvedValue({
        choices: [{ message: { content: 'Normal response' } }]
      });

      const result = await mind.chat('Hello');

      expect(result).toBe('Normal response');
      
      // Should not include tools in request
      const callArgs = mind.makeRequest.mock.calls[0][1];
      expect(callArgs.tools).toBeUndefined();
    });
  });

  describe('_executeTool()', () => {
    beforeEach(() => {
      mind.registerTool({
        name: 'testTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: { value: { type: 'string' } } },
        handler: async (args) => ({ result: `processed_${args.value}` })
      });
    });

    it('should execute tool with correct arguments', async () => {
      const toolCall = {
        id: 'call_test',
        function: {
          name: 'testTool',
          arguments: JSON.stringify({ value: 'test_input' })
        }
      };

      const result = await mind._executeTool(toolCall);

      expect(result).toEqual({ result: 'processed_test_input' });
    });

    it('should throw error for non-existent tool', async () => {
      const toolCall = {
        id: 'call_test',
        function: {
          name: 'nonExistentTool',
          arguments: '{}'
        }
      };

      await expect(mind._executeTool(toolCall)).rejects.toThrow("Tool 'nonExistentTool' not found");
    });

    it('should handle invalid JSON arguments', async () => {
      const toolCall = {
        id: 'call_test',
        function: {
          name: 'testTool',
          arguments: 'invalid json'
        }
      };

      await expect(mind._executeTool(toolCall)).rejects.toThrow('Tool execution failed');
    });
  });
});
