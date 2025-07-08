// Simple test to verify memory tool registration
const WarpMind = require('./dist/warpmind.js');

async function testMemoryToolRegistration() {
    console.log('🧪 Testing Memory Tool Registration...\n');

    // Initialize WarpMind
    const ai = new WarpMind({
        baseURL: 'https://warp.cs.au.dk/mind/v1',
        apiKey: '4e6faecf-a386-47de-98e5-149ec5c9a2b2',
        memoryToolEnabled: true
    });

    console.log('✅ WarpMind initialized\n');

    // Check if tools are registered
    console.log('🔍 Checking registered tools...');
    console.log('Number of registered tools:', ai._tools.length);
    
    if (ai._tools.length > 0) {
        ai._tools.forEach((tool, index) => {
            console.log(`Tool ${index + 1}:`, tool.schema.function.name);
            console.log('  Description:', tool.schema.function.description);
        });
    } else {
        console.log('No tools registered');
    }

    // Test memory operations directly
    console.log('\n📝 Testing direct memory operations...');
    try {
        const memory = await ai.remember("Test memory for tool integration", { tags: ['test'] });
        console.log('✅ Memory stored successfully:', memory.id);
        
        const memories = await ai.getMemories();
        console.log('✅ Retrieved memories count:', memories.length);
        
        const recalled = await ai.recall("test memory");
        console.log('✅ Recall test successful, found:', recalled.length, 'memories');
        
    } catch (error) {
        console.log('❌ Memory operation failed:', error.message);
    }

    console.log('\n🎉 Tool registration test completed!');
}

// Run the test
testMemoryToolRegistration().catch(error => {
    console.error('❌ Test failed:', error);
});
