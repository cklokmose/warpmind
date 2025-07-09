/**
 * Test for streaming chat with tool calling functionality
 */

const Warpmind = require('../src/warpmind');

describe('Warpmind streamChat with Tool Calling', () => {
  let warpmind;

  beforeEach(() => {
    warpmind = new Warpmind({
      baseURL: 'http://localhost:8080/v1',
      apiKey: 'test-key',
      memoryToolEnabled: false // Disable auto-registration of memory tool for clean testing
    });
  });

  describe('Tool Integration in Streaming', () => {
    it('should include tools in streaming requests when tools are registered', async () => {
      // Register a test tool
      warpmind.registerTool({
        name: 'testTool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        },
        handler: async (args) => {
          return { result: `processed: ${args.input}` };
        }
      });

      // Mock fetch to verify tools are included
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: [DONE]\n\n')
              })
              .mockResolvedValueOnce({ done: true })
          })
        }
      });

      await warpmind.streamChat('Test message', (chunk) => {});

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'api-key': 'test-key'
          }),
          body: expect.stringContaining('"tools"')
        })
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeDefined();
      expect(requestBody.tools).toHaveLength(1);
      expect(requestBody.tools[0].function.name).toBe('testTool');
      expect(requestBody.tool_choice).toBe('auto');
    });

    it('should not include tools when no tools are registered', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: [DONE]\n\n')
              })
              .mockResolvedValueOnce({ done: true })
          })
        }
      });

      await warpmind.streamChat('Test message', (chunk) => {});

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeUndefined();
      expect(requestBody.tool_choice).toBeUndefined();
    });

    it('should handle streaming with tool calls and recursive execution', async () => {
      // Register a test tool
      warpmind.registerTool({
        name: 'getWeather',
        description: 'Get weather information',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' }
          },
          required: ['city']
        },
        handler: async (args) => {
          return { temperature: 22, condition: 'sunny', city: args.city };
        }
      });

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          // First call - return streaming response with tool call
          return Promise.resolve({
            ok: true,
            body: {
              getReader: () => ({
                read: jest.fn()
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n')
                  })
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"getWeather","arguments":"{\\"city\\":\\"London\\"}"}}]}}]}\n\n')
                  })
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: [DONE]\n\n')
                  })
                  .mockResolvedValueOnce({ done: true })
              })
            }
          });
        } else {
          // Second call - return final response after tool execution
          return Promise.resolve({
            ok: true,
            body: {
              getReader: () => ({
                read: jest.fn()
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"The weather in London is sunny with a temperature of 22°C."}}]}\n\n')
                  })
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: [DONE]\n\n')
                  })
                  .mockResolvedValueOnce({ done: true })
              })
            }
          });
        }
      });

      const chunks = [];
      const result = await warpmind.streamChat('What is the weather in London?', (chunk) => {
        chunks.push(chunk);
      });

      // Verify both API calls were made
      expect(fetch).toHaveBeenCalledTimes(2);
      
      // Verify final result includes tool response
      expect(result).toContain('22°C');
      
      // Verify chunks were emitted for the final response
      const contentChunks = chunks.filter(chunk => chunk.content && chunk.content.length > 0);
      expect(contentChunks.length).toBeGreaterThan(0);
    });

    it('should respect max depth limit for tool calls', async () => {
      // Register a tool that calls another tool (infinite recursion scenario)
      warpmind.registerTool({
        name: 'recursiveTool',
        description: 'A tool that might cause recursion',
        parameters: {
          type: 'object',
          properties: {
            depth: { type: 'number' }
          },
          required: ['depth']
        },
        handler: async (args) => {
          return { depth: args.depth + 1 };
        }
      });

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        
        // Always return a tool call to test depth limiting
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: jest.fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n')
                })
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode(`data: {"choices":[{"delta":{"tool_calls":[{"id":"call_${callCount}","type":"function","function":{"name":"recursiveTool","arguments":"{\\"depth\\":${callCount}}"}}]}}]}\n\n`)
                })
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode('data: [DONE]\n\n')
                })
                .mockResolvedValueOnce({ done: true })
            })
          }
        });
      });

      const result = await warpmind.streamChat('Start recursion test', (chunk) => {});

      // Should stop at max depth (2) plus initial call = 3 total calls max
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
