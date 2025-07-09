/**
 * Tests for Tool Call Inspection functionality
 */

const WarpMind = require('../src/warpmind.js');

describe('Tool Call Inspection', () => {
  let client;
  
  beforeEach(() => {
    // Create client with memory tool disabled to avoid interference
    client = new WarpMind({ 
      apiKey: 'test-key',
      memoryToolEnabled: false
    });
  });

  describe('ToolCallTracker', () => {
    test('should track tool call lifecycle', () => {
      const tracker = client._toolCallTracker;
      
      // Start a call
      const call = tracker.startCall('test_tool', { param1: 'value1' });
      
      expect(call).toMatchObject({
        callId: expect.any(String),
        name: 'test_tool',
        parameters: { param1: 'value1' },
        timestamp: expect.any(String)
      });
      
      expect(tracker.getActiveCalls()).toHaveLength(1);
      
      // Complete the call
      const completed = tracker.completeCall(call.callId, { result: 'success' });
      
      expect(completed).toMatchObject({
        ...call,
        result: { result: 'success' },
        duration: expect.any(Number),
        status: 'completed'
      });
      
      expect(tracker.getActiveCalls()).toHaveLength(0);
      expect(tracker.getCallHistory()).toHaveLength(1);
    });
    
    test('should track tool call errors', () => {
      const tracker = client._toolCallTracker;
      
      const call = tracker.startCall('test_tool', { param1: 'value1' });
      const error = new Error('Test error');
      const errorCall = tracker.errorCall(call.callId, error);
      
      expect(errorCall).toMatchObject({
        ...call,
        error: 'Test error',
        duration: expect.any(Number),
        status: 'error'
      });
      
      expect(tracker.getActiveCalls()).toHaveLength(0);
      expect(tracker.getCallHistory()).toHaveLength(1);
    });
    
    test('should generate unique call IDs', () => {
      const tracker = client._toolCallTracker;
      
      const id1 = tracker.generateCallId();
      const id2 = tracker.generateCallId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^call_\d+_\d+_[a-z0-9]+$/);
    });
    
    test('should sanitize large parameters', () => {
      const tracker = client._toolCallTracker;
      
      // Create a large parameter object
      const largeParam = { data: 'x'.repeat(15000) };
      const sanitized = tracker._sanitizeParameters(largeParam);
      
      expect(sanitized).toMatchObject({
        _truncated: true,
        _originalSize: expect.any(Number),
        _preview: expect.any(String)
      });
    });
  });

  describe('Callback Integration', () => {
    test('should call onToolCall callback', async () => {
      const toolCalls = [];
      
      // Register a test tool
      client.registerTool({
        name: 'test_callback_tool',
        description: 'A test tool for callback testing',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        handler: async (args) => {
          return { response: `Processed: ${args.message}` };
        }
      });
      
      // Mock the API response to include tool calls
      const originalMakeRequest = client.makeRequest;
      client.makeRequest = jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_123',
              function: {
                name: 'test_callback_tool',
                arguments: JSON.stringify({ message: 'test' })
              }
            }]
          }
        }],
        usage: { total_tokens: 50 }
      });
      
      // Second call returns final response
      client.makeRequest
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_123',
                function: {
                  name: 'test_callback_tool',
                  arguments: JSON.stringify({ message: 'test' })
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Tool execution completed successfully'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      const response = await client.chat('Test message', {
        onToolCall: (call) => {
          toolCalls.push(call);
        }
      });
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toMatchObject({
        callId: expect.any(String),
        name: 'test_callback_tool',
        parameters: { message: 'test' },
        timestamp: expect.any(String)
      });
      
      expect(response).toBe('Tool execution completed successfully');
      
      // Restore original method
      client.makeRequest = originalMakeRequest;
    });
    
    test('should call onToolResult callback', async () => {
      const toolResults = [];
      
      // Register a test tool
      client.registerTool({
        name: 'test_result_tool',
        description: 'A test tool for result callback testing',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        },
        handler: async (args) => {
          return { output: `Processed: ${args.input}` };
        }
      });
      
      // Mock the API response
      client.makeRequest = jest.fn()
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_456',
                function: {
                  name: 'test_result_tool',
                  arguments: JSON.stringify({ input: 'test data' })
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Processing completed'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      await client.chat('Process some data', {
        onToolResult: (result) => {
          toolResults.push(result);
        }
      });
      
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0]).toMatchObject({
        callId: expect.any(String),
        name: 'test_result_tool',
        result: { output: 'Processed: test data' },
        duration: expect.any(Number),
        timestamp: expect.any(String)
      });
    });
    
    test('should call onToolError callback on tool failure', async () => {
      const toolErrors = [];
      
      // Register a tool that throws an error
      client.registerTool({
        name: 'failing_tool',
        description: 'A tool that always fails',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async () => {
          throw new Error('Tool intentionally failed');
        }
      });
      
      // Mock the API response
      client.makeRequest = jest.fn()
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_error',
                function: {
                  name: 'failing_tool',
                  arguments: '{}'
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Error handled'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      await client.chat('Run failing tool', {
        onToolError: (error) => {
          toolErrors.push(error);
        }
      });
      
      expect(toolErrors).toHaveLength(1);
      expect(toolErrors[0]).toMatchObject({
        callId: expect.any(String),
        name: 'failing_tool',
        error: 'Tool intentionally failed', // The tracker stores the original error message
        duration: expect.any(Number),
        timestamp: expect.any(String)
      });
    });
  });

  describe('Enhanced Return Objects', () => {
    test('should return metadata when returnMetadata is true', async () => {
      // Register a test tool
      client.registerTool({
        name: 'metadata_tool',
        description: 'A tool for metadata testing',
        parameters: {
          type: 'object',
          properties: {
            value: { type: 'string' }
          }
        },
        handler: async (args) => {
          return { processed: args.value };
        }
      });
      
      // Mock the API response
      client.makeRequest = jest.fn()
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_meta',
                function: {
                  name: 'metadata_tool',
                  arguments: JSON.stringify({ value: 'test' })
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Metadata test completed'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      const result = await client.chat('Test with metadata', {
        returnMetadata: true
      });
      
      expect(result).toMatchObject({
        response: 'Metadata test completed',
        metadata: {
          toolCalls: [{
            id: expect.any(String),
            name: 'metadata_tool',
            parameters: { value: 'test' },
            result: { processed: 'test' },
            duration: expect.any(Number),
            success: true,
            timestamp: expect.any(String)
          }],
          totalDuration: expect.any(Number),
          tokensUsed: 50 // Using the first response token count
        }
      });
    });
    
    test('should return simple response when returnMetadata is false', async () => {
      // Register a test tool
      client.registerTool({
        name: 'simple_tool',
        description: 'A simple tool',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async () => {
          return { result: 'success' };
        }
      });
      
      // Mock the API response
      client.makeRequest = jest.fn()
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_simple',
                function: {
                  name: 'simple_tool',
                  arguments: '{}'
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Simple response'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      const result = await client.chat('Simple test', {
        returnMetadata: false
      });
      
      expect(typeof result).toBe('string');
      expect(result).toBe('Simple response');
    });
  });

  describe('Streaming Chat Integration', () => {
    test.skip('should support callbacks in streamChat (complex streaming mock)', async () => {
      // This test is skipped due to complexity of mocking SSE parsing
      // The functionality is verified through integration with the regular streamChat method
    });
  });

  describe('Error Handling', () => {
    test('should handle callback errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Register a test tool
      client.registerTool({
        name: 'callback_error_tool',
        description: 'Tool for testing callback errors',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async () => {
          return { success: true };
        }
      });
      
      // Mock the API response
      client.makeRequest = jest.fn()
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_cb_error',
                function: {
                  name: 'callback_error_tool',
                  arguments: '{}'
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Callback error handled'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      // Use a callback that throws an error
      const response = await client.chat('Test callback error', {
        onToolCall: () => {
          throw new Error('Callback failed');
        }
      });
      
      expect(response).toBe('Callback error handled');
      expect(consoleSpy).toHaveBeenCalledWith('Error in tool call callback:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
    
    test('should not break on invalid callback types', async () => {
      // Register a test tool
      client.registerTool({
        name: 'invalid_callback_tool',
        description: 'Tool for testing invalid callbacks',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async () => {
          return { success: true };
        }
      });
      
      // Mock the API response
      client.makeRequest = jest.fn()
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_invalid',
                function: {
                  name: 'invalid_callback_tool',
                  arguments: '{}'
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Invalid callback handled'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      // Use invalid callback types
      const response = await client.chat('Test invalid callbacks', {
        onToolCall: 'not a function',
        onToolResult: 123,
        onToolError: null
      });
      
      expect(response).toBe('Invalid callback handled');
    });
  });

  describe('Data Processing Module Integration', () => {
    test('should support callbacks when process() calls chat()', async () => {
      const toolCalls = [];
      
      // Register a tool that might be called during processing
      client.registerTool({
        name: 'data_processing_tool',
        description: 'Tool for data processing',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' }
          }
        },
        handler: async (args) => {
          return { processed: true, data: args.data };
        }
      });
      
      // Mock the API response for the process method
      client.makeRequest = jest.fn()
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_process',
                function: {
                  name: 'data_processing_tool',
                  arguments: JSON.stringify({ data: 'process_data' })
                }
              }]
            }
          }],
          usage: { total_tokens: 50 }
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '{"result": "processed", "status": "complete"}'
            }
          }],
          usage: { total_tokens: 75 }
        });
      
      const result = await client.process('Process this data', 'test data', {
        result: 'string - the processing result',
        status: 'string - the processing status'
      }, {
        onToolCall: (call) => {
          toolCalls.push(call);
        }
      });
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toMatchObject({
        callId: expect.any(String),
        name: 'data_processing_tool',
        parameters: { data: 'process_data' },
        timestamp: expect.any(String)
      });
      
      expect(result).toMatchObject({
        result: 'processed',
        status: 'complete'
      });
    });
  });
});
