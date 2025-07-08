// Test script for memory tool functionality
const WarpMind = require('./dist/warpmind.js');

async function testMemoryTool() {
    console.log('🧪 Testing Memory Tool Integration...\n');

    // Initialize WarpMind with memory tool enabled
    const ai = new WarpMind({
        baseURL: 'https://warp.cs.au.dk/mind/v1',
        apiKey: '4e6faecf-a386-47de-98e5-149ec5c9a2b2',
        model: 'gpt-3.5-turbo',
        maxTokens: 200,
        temperature: 0.7,
        memoryToolEnabled: true,
        memoryToolExplicitOnly: true,
        memoryToolMaxResults: 3
    });

    console.log('✅ WarpMind initialized with memory tool configuration\n');

    // First, store some test memories
    console.log('📝 Storing test memories...');
    try {
        await ai.remember("John's favorite color is blue and he loves reading science fiction books.", { tags: ['personal', 'preferences'] });
        await ai.remember("The project deadline for the AI chatbot is next Friday.", { tags: ['work', 'deadline'] });
        await ai.remember("Sarah mentioned she's allergic to peanuts during lunch.", { tags: ['personal', 'health'] });
        console.log('✅ Test memories stored successfully\n');
    } catch (error) {
        console.log('❌ Failed to store memories:', error.message);
        return;
    }

    // Test 1: Chat that should trigger memory tool (explicit request)
    console.log('🧪 Test 1: Explicit memory request');
    try {
        const response = await ai.chat([
            { role: 'user', content: 'What do you remember about John\'s preferences?' }
        ]);
        console.log('✅ Response:', response);
        console.log('');
    } catch (error) {
        console.log('❌ Failed:', error.message);
        console.log('');
    }

    // Test 2: Chat that should NOT trigger memory tool (general question)
    console.log('🧪 Test 2: General knowledge question (should NOT use memory tool)');
    try {
        const response = await ai.chat([
            { role: 'user', content: 'What is the capital of France?' }
        ]);
        console.log('✅ Response:', response);
        console.log('');
    } catch (error) {
        console.log('❌ Failed:', error.message);
        console.log('');
    }

    // Test 3: Another explicit memory request
    console.log('🧪 Test 3: Explicit memory request about work');
    try {
        const response = await ai.chat([
            { role: 'user', content: 'Can you recall any work-related deadlines I stored?' }
        ]);
        console.log('✅ Response:', response);
        console.log('');
    } catch (error) {
        console.log('❌ Failed:', error.message);
        console.log('');
    }

    console.log('🎉 Memory tool testing completed!');
}

// Run the test
testMemoryTool().catch(error => {
    console.error('❌ Test failed:', error);
});
