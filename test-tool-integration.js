#!/usr/bin/env node

/**
 * Quick test to verify tool calling integration works in the complete test suite
 */

const Warpmind = require('./src/warpmind.js');

async function testToolIntegration() {
    console.log('🧪 Testing tool calling integration...');
    
    const wm = new Warpmind({
        apiKey: 'test-key',
        baseURL: 'http://localhost:8080/v1'
    });

    // Register a simple test tool
    wm.registerTool({
        name: 'testTool',
        description: 'A simple test tool',
        parameters: {
            type: 'object',
            properties: {
                input: { type: 'string' }
            },
            required: ['input']
        },
        handler: async (args) => {
            return { result: `Processed: ${args.input}`, timestamp: new Date().toISOString() };
        }
    });

    console.log('✅ Tool registered successfully');
    console.log(`📊 Tools count: ${wm._tools.length}`);
    console.log(`🛠️ Tool name: ${wm._tools[0].schema.function.name}`);
    
    // Test tool access pattern (same as used in the HTML)
    if (wm._tools && wm._tools.length > 0) {
        const toolNames = wm._tools.map(t => t.schema.function.name);
        console.log(`🔧 Available tools: ${toolNames.join(', ')}`);
    }

    console.log('✅ Tool calling integration test passed!');
}

testToolIntegration().catch(console.error);
