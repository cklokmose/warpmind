/**
 * Tool Call Inspection Examples
 * 
 * This file demonstrates the new tool call inspection capabilities in WarpMind,
 * showing different ways to monitor and debug tool usage in your applications.
 */

const WarpMind = require('../src/warpmind.js');

async function basicToolCallMonitoring() {
  console.log('\n=== Basic Tool Call Monitoring ===');
  
  const client = new WarpMind({ 
    apiKey: 'your-api-key',
    memoryToolEnabled: false // Disable for cleaner examples
  });

  // Register a simple tool
  client.registerTool({
    name: 'calculator',
    description: 'Perform basic math calculations',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['operation', 'a', 'b']
    },
    handler: async ({ operation, a, b }) => {
      let result;
      switch (operation) {
        case 'add': result = a + b; break;
        case 'subtract': result = a - b; break;
        case 'multiply': result = a * b; break;
        case 'divide': result = b !== 0 ? a / b : 'Error: Division by zero'; break;
        default: result = 'Error: Unknown operation';
      }
      return { result, operation, inputs: { a, b } };
    }
  });

  // Basic monitoring with callbacks
  const response = await client.chat('Calculate 15 * 7 for me', {
    onToolCall: (call) => {
      console.log(`🔧 Tool Called: ${call.name}`);
      console.log(`   Parameters:`, call.parameters);
      console.log(`   Timestamp: ${call.timestamp}`);
    },
    onToolResult: (result) => {
      console.log(`✅ Tool Completed: ${result.name}`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Result:`, result.result);
    },
    onToolError: (error) => {
      console.log(`❌ Tool Failed: ${error.name}`);
      console.log(`   Error: ${error.error}`);
      console.log(`   Duration: ${error.duration}ms`);
    }
  });

  console.log(`Final Response: ${response}`);
}

async function enhancedReturnObjects() {
  console.log('\n=== Enhanced Return Objects with Metadata ===');
  
  const client = new WarpMind({ 
    apiKey: 'your-api-key',
    memoryToolEnabled: false
  });

  // Register a text processing tool
  client.registerTool({
    name: 'text_analyzer',
    description: 'Analyze text for various metrics',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        analysis_type: { type: 'string', enum: ['word_count', 'sentiment', 'length'] }
      },
      required: ['text', 'analysis_type']
    },
    handler: async ({ text, analysis_type }) => {
      switch (analysis_type) {
        case 'word_count':
          return { word_count: text.split(/\s+/).length };
        case 'sentiment':
          return { sentiment: 'positive', confidence: 0.8 };
        case 'length':
          return { character_count: text.length };
        default:
          return { error: 'Unknown analysis type' };
      }
    }
  });

  // Use returnMetadata to get detailed information
  const result = await client.chat('Analyze the word count of this sentence', {
    returnMetadata: true
  });

  console.log('Response:', result.response);
  console.log('\nMetadata:');
  console.log(`- Total Duration: ${result.metadata.totalDuration}ms`);
  console.log(`- Tokens Used: ${result.metadata.tokensUsed}`);
  console.log('- Tool Calls:');
  
  result.metadata.toolCalls.forEach((call, index) => {
    console.log(`  ${index + 1}. ${call.name}`);
    console.log(`     Parameters:`, call.parameters);
    console.log(`     Result:`, call.result);
    console.log(`     Duration: ${call.duration}ms`);
    console.log(`     Success: ${call.success}`);
  });
}

async function errorHandlingAndDebugging() {
  console.log('\n=== Error Handling and Debugging ===');
  
  const client = new WarpMind({ 
    apiKey: 'your-api-key',
    memoryToolEnabled: false
  });

  // Register a tool that sometimes fails
  client.registerTool({
    name: 'unreliable_tool',
    description: 'A tool that might fail for demonstration',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        should_fail: { type: 'boolean' }
      },
      required: ['action']
    },
    handler: async ({ action, should_fail = false }) => {
      if (should_fail) {
        throw new Error(`Action '${action}' failed intentionally`);
      }
      return { success: true, action, timestamp: new Date().toISOString() };
    }
  });

  console.log('Testing successful tool call:');
  await client.chat('Execute action "test" successfully', {
    onToolCall: (call) => console.log(`📞 Calling: ${call.name}`),
    onToolResult: (result) => console.log(`✅ Success: ${result.duration}ms`),
    onToolError: (error) => console.log(`❌ Error: ${error.error}`)
  });

  console.log('\nTesting failing tool call:');
  await client.chat('Execute action "fail" with failure enabled', {
    onToolCall: (call) => console.log(`📞 Calling: ${call.name}`),
    onToolResult: (result) => console.log(`✅ Success: ${result.duration}ms`),
    onToolError: (error) => console.log(`❌ Error: ${error.error} (${error.duration}ms)`)
  });
}

async function dataProcessingIntegration() {
  console.log('\n=== Data Processing Module Integration ===');
  
  const client = new WarpMind({ 
    apiKey: 'your-api-key',
    memoryToolEnabled: false
  });

  // Register a data validation tool
  client.registerTool({
    name: 'data_validator',
    description: 'Validate data structure and content',
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'object' },
        validation_rules: { type: 'array' }
      },
      required: ['data']
    },
    handler: async ({ data, validation_rules = [] }) => {
      const errors = [];
      const warnings = [];
      
      // Simple validation logic
      if (!data.name) errors.push('Missing required field: name');
      if (data.age && data.age < 0) errors.push('Age cannot be negative');
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        validated_fields: Object.keys(data)
      };
    }
  });

  // Use process() method with tool call monitoring
  const toolCalls = [];
  
  const result = await client.process(
    'Validate and process this user data',
    { name: 'John Doe', age: 30, email: 'john@example.com' },
    {
      valid: 'boolean - whether the data is valid',
      errors: 'array - list of validation errors',
      processed_data: 'object - the processed user data'
    },
    {
      onToolCall: (call) => {
        toolCalls.push(call);
        console.log(`🔧 Data processing tool called: ${call.name}`);
      },
      onToolResult: (result) => {
        console.log(`✅ Tool completed in ${result.duration}ms`);
      }
    }
  );

  console.log('Processing Result:', result);
  console.log(`Tools called: ${toolCalls.length}`);
}

async function performanceMonitoring() {
  console.log('\n=== Performance Monitoring ===');
  
  const client = new WarpMind({ 
    apiKey: 'your-api-key',
    memoryToolEnabled: false
  });

  // Register a slow tool for demonstration
  client.registerTool({
    name: 'slow_processor',
    description: 'A tool that takes time to process',
    parameters: {
      type: 'object',
      properties: {
        delay_ms: { type: 'number' },
        task: { type: 'string' }
      },
      required: ['task']
    },
    handler: async ({ delay_ms = 100, task }) => {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, delay_ms));
      return { 
        task_completed: task,
        processing_time: delay_ms,
        status: 'completed'
      };
    }
  });

  const performanceData = [];
  
  const result = await client.chat('Process a complex task that takes some time', {
    returnMetadata: true,
    onToolCall: (call) => {
      console.log(`⏱️  Starting ${call.name}...`);
    },
    onToolResult: (result) => {
      performanceData.push({
        tool: result.name,
        duration: result.duration,
        timestamp: result.timestamp
      });
      
      // Alert on slow tools
      if (result.duration > 200) {
        console.log(`⚠️  Slow tool detected: ${result.name} took ${result.duration}ms`);
      } else {
        console.log(`✅ Fast completion: ${result.name} (${result.duration}ms)`);
      }
    }
  });

  console.log('\nPerformance Summary:');
  console.log(`Total Duration: ${result.metadata.totalDuration}ms`);
  console.log(`Tools Called: ${performanceData.length}`);
  
  const avgDuration = performanceData.reduce((sum, p) => sum + p.duration, 0) / performanceData.length;
  console.log(`Average Tool Duration: ${avgDuration.toFixed(1)}ms`);
}

async function streamingWithCallbacks() {
  console.log('\n=== Streaming Chat with Tool Call Callbacks ===');
  
  const client = new WarpMind({ 
    apiKey: 'your-api-key',
    memoryToolEnabled: false
  });

  // Register a tool for streaming demo
  client.registerTool({
    name: 'content_generator',
    description: 'Generate content based on a topic',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        length: { type: 'string', enum: ['short', 'medium', 'long'] }
      },
      required: ['topic']
    },
    handler: async ({ topic, length = 'medium' }) => {
      const lengths = {
        short: 'A brief overview',
        medium: 'A detailed explanation with examples',
        long: 'A comprehensive analysis with multiple perspectives'
      };
      
      return {
        generated_content: `${lengths[length]} about ${topic}`,
        word_count: length === 'short' ? 50 : length === 'medium' ? 200 : 500,
        topic
      };
    }
  });

  console.log('Starting streaming chat with tool monitoring...');
  
  const chunks = [];
  const toolCalls = [];
  
  const response = await client.streamChat(
    'Generate content about artificial intelligence',
    (chunk) => {
      chunks.push(chunk.content);
      process.stdout.write(chunk.content);
    },
    {
      onToolCall: (call) => {
        toolCalls.push(call);
        console.log(`\n🔧 Tool called during streaming: ${call.name}`);
      },
      onToolResult: (result) => {
        console.log(`\n✅ Tool completed: ${result.duration}ms`);
      }
    }
  );

  console.log(`\n\nStreaming completed. Tools called: ${toolCalls.length}`);
  console.log(`Total chunks received: ${chunks.length}`);
}

// Example of a custom tool call monitor class
class ToolCallMonitor {
  constructor() {
    this.calls = [];
    this.errors = [];
    this.stats = {
      totalCalls: 0,
      totalDuration: 0,
      successRate: 0
    };
  }

  onToolCall(call) {
    console.log(`📊 Monitor: Tool ${call.name} started`);
    this.calls.push({ ...call, status: 'started' });
  }

  onToolResult(result) {
    console.log(`📊 Monitor: Tool ${result.name} completed (${result.duration}ms)`);
    
    // Update call record
    const call = this.calls.find(c => c.callId === result.callId);
    if (call) {
      call.status = 'completed';
      call.duration = result.duration;
      call.result = result.result;
    }
    
    this.updateStats();
  }

  onToolError(error) {
    console.log(`📊 Monitor: Tool ${error.name} failed - ${error.error}`);
    this.errors.push(error);
    
    // Update call record
    const call = this.calls.find(c => c.callId === error.callId);
    if (call) {
      call.status = 'failed';
      call.duration = error.duration;
      call.error = error.error;
    }
    
    this.updateStats();
  }

  updateStats() {
    this.stats.totalCalls = this.calls.length;
    this.stats.totalDuration = this.calls
      .filter(c => c.duration)
      .reduce((sum, c) => sum + c.duration, 0);
    
    const completed = this.calls.filter(c => c.status === 'completed').length;
    this.stats.successRate = this.stats.totalCalls > 0 
      ? (completed / this.stats.totalCalls) * 100 
      : 0;
  }

  getReport() {
    return {
      totalCalls: this.stats.totalCalls,
      successRate: `${this.stats.successRate.toFixed(1)}%`,
      averageDuration: this.stats.totalCalls > 0 
        ? `${(this.stats.totalDuration / this.stats.totalCalls).toFixed(1)}ms`
        : '0ms',
      errors: this.errors.length,
      recentCalls: this.calls.slice(-5)
    };
  }
}

async function customMonitoringExample() {
  console.log('\n=== Custom Tool Call Monitor ===');
  
  const client = new WarpMind({ 
    apiKey: 'your-api-key',
    memoryToolEnabled: false
  });
  
  const monitor = new ToolCallMonitor();

  // Register multiple tools
  client.registerTool({
    name: 'formatter',
    description: 'Format text in different ways',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        format: { type: 'string', enum: ['uppercase', 'lowercase', 'title'] }
      },
      required: ['text', 'format']
    },
    handler: async ({ text, format }) => {
      switch (format) {
        case 'uppercase': return { formatted: text.toUpperCase() };
        case 'lowercase': return { formatted: text.toLowerCase() };
        case 'title': return { formatted: text.replace(/\w\S*/g, (txt) => 
          txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()) };
        default: return { formatted: text };
      }
    }
  });

  // Use the monitor
  await client.chat('Format "hello world" in title case', {
    onToolCall: monitor.onToolCall.bind(monitor),
    onToolResult: monitor.onToolResult.bind(monitor),
    onToolError: monitor.onToolError.bind(monitor)
  });

  // Get monitoring report
  const report = monitor.getReport();
  console.log('\nMonitoring Report:', JSON.stringify(report, null, 2));
}

// Main execution function
async function main() {
  console.log('WarpMind Tool Call Inspection Examples');
  console.log('=====================================');
  
  try {
    await basicToolCallMonitoring();
    await enhancedReturnObjects();
    await errorHandlingAndDebugging();
    await dataProcessingIntegration();
    await performanceMonitoring();
    await streamingWithCallbacks();
    await customMonitoringExample();
    
    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example failed:', error.message);
  }
}

// Export for use in other modules
module.exports = {
  ToolCallMonitor,
  basicToolCallMonitoring,
  enhancedReturnObjects,
  errorHandlingAndDebugging,
  dataProcessingIntegration,
  performanceMonitoring,
  streamingWithCallbacks,
  customMonitoringExample
};

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}
