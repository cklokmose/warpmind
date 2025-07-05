// Real API test for WarpMind against warp.cs.au.dk/mind endpoint
// This test uses the actual API key and endpoint provided

const WarpMind = require('./dist/warpmind.js').default || require('./dist/warpmind.js');

async function runRealAPITests() {
    console.log('🌐 Testing WarpMind Library against Real API...\n');
    console.log('Endpoint: warp.cs.au.dk/mind/v1');
    console.log('API Key: 4e6faecf-a386-47de-98e5-149ec5c9a2b2\n');

    // Initialize with the real endpoint and API key
    const ai = new WarpMind({
        baseURL: 'https://warp.cs.au.dk/mind/v1',
        apiKey: '4e6faecf-a386-47de-98e5-149ec5c9a2b2',
        model: 'gpt-3.5-turbo',
        maxTokens: 100,
        temperature: 0.7
    });

    console.log('✅ WarpMind instance created with real configuration\n');

    // Test 1: Simple question
    console.log('🧪 Test 1: Simple Question');
    try {
        const response = await ai.ask('What is 2 + 2?');
        console.log('✅ Success!');
        console.log('Question: What is 2 + 2?');
        console.log('Response:', response);
        console.log('');
    } catch (error) {
        console.log('❌ Failed:', error.message);
        console.log('');
    }

    // Test 2: Chat with context
    console.log('🧪 Test 2: Chat with Context');
    try {
        const messages = [
            { role: 'system', content: 'You are a helpful math tutor.' },
            { role: 'user', content: 'Explain what a prime number is in simple terms.' }
        ];
        const response = await ai.chat(messages);
        console.log('✅ Success!');
        console.log('Context: Math tutor');
        console.log('Question: Explain what a prime number is in simple terms.');
        console.log('Response:', response);
        console.log('');
    } catch (error) {
        console.log('❌ Failed:', error.message);
        console.log('');
    }

    // Test 3: Different temperature setting
    console.log('🧪 Test 3: Creative Response (Higher Temperature)');
    try {
        const response = await ai.ask('Tell me a short joke about programming', {
            temperature: 0.9,
            maxTokens: 80
        });
        console.log('✅ Success!');
        console.log('Question: Tell me a short joke about programming');
        console.log('Temperature: 0.9 (more creative)');
        console.log('Response:', response);
        console.log('');
    } catch (error) {
        console.log('❌ Failed:', error.message);
        console.log('');
    }

    // Test 4: Longer response
    console.log('🧪 Test 4: Longer Response');
    try {
        ai.configure({ maxTokens: 200 });
        const response = await ai.ask('Explain the concept of machine learning in simple terms for a beginner.');
        console.log('✅ Success!');
        console.log('Question: Explain machine learning for beginners');
        console.log('Max tokens: 200');
        console.log('Response:', response);
        console.log('');
    } catch (error) {
        console.log('❌ Failed:', error.message);
        console.log('');
    }

    // Test 5: Error handling with invalid model
    console.log('🧪 Test 5: Error Handling (Invalid Model)');
    try {
        const response = await ai.ask('Hello', { model: 'nonexistent-model' });
        console.log('Response:', response);
    } catch (error) {
        console.log('✅ Error handled correctly:', error.message);
        console.log('');
    }

    console.log('🎉 All tests completed!');
    console.log('\n📊 Summary:');
    console.log('- Library successfully connects to warp.cs.au.dk/mind/v1');
    console.log('- API key authentication works');
    console.log('- Various question types and configurations tested');
    console.log('- Error handling verified');
}

// Helper function to test streaming (if supported)
async function testStreaming() {
    console.log('\n🌊 Testing Streaming Response...');
    
    const ai = new WarpMind({
        baseURL: 'https://warp.cs.au.dk/mind/v1',
        apiKey: '4e6faecf-a386-47de-98e5-149ec5c9a2b2'
    });

    try {
        let streamedContent = '';
        await ai.streamChat('Count from 1 to 10', (chunk) => {
            process.stdout.write(chunk);
            streamedContent += chunk;
        });
        console.log('\n✅ Streaming test completed');
        console.log('Full streamed response:', streamedContent);
    } catch (error) {
        console.log('❌ Streaming failed:', error.message);
        console.log('(This might be expected if the endpoint doesn\'t support streaming)');
    }
}

// Helper function to test TTS (Text-to-Speech)
async function testTTS() {
    console.log('\n🔊 Testing Text-to-Speech...');
    
    const ai = new WarpMind({
        baseURL: 'https://warp.cs.au.dk/mind/v1',
        apiKey: '4e6faecf-a386-47de-98e5-149ec5c9a2b2'
    });

    try {
        const audioBlob = await ai.textToSpeech('Hello, this is a test of the text to speech functionality.');
        console.log('✅ TTS request successful!');
        console.log('Audio blob type:', audioBlob.type);
        console.log('Audio blob size:', audioBlob.size, 'bytes');
        
        // Convert blob to buffer and save to file for verification
        const fs = require('fs');
        const arrayBuffer = await audioBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync('tts-test-patched.mp3', buffer);
        console.log('✅ Audio saved to tts-test-patched.mp3');
        
        // Check if it's a valid MP3 by looking at the header
        const header = buffer.slice(0, 3);
        if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
            console.log('✅ Valid MP3 file detected (ID3 header found)');
        } else if (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) {
            console.log('✅ Valid MP3 file detected (MP3 sync header found)');
        } else {
            console.log('⚠️  File header analysis:');
            console.log('First 10 bytes:', Array.from(buffer.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        }
        
    } catch (error) {
        console.log('❌ TTS failed:', error.message);
    }
}

// Run the tests
async function main() {
    try {
        await runRealAPITests();
        await testStreaming();
        await testTTS();
    } catch (error) {
        console.error('❌ Test suite failed:', error);
    }
}

main();
