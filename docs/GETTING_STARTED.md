# Getting Started with Warpmind

## What is Warpmind?

Warpmind is a simple JavaScript library that makes it easy for students to use OpenAI's API in their web projects. It handles all the complex API setup and provides simple methods to interact with AI models.

## Quick Setup (5 minutes)

### Step 1: Get the Library
1. Download this project
2. Run `npm install && npm run build` in the project folder
3. Copy the `dist/warpmind.js` file to your project

### Step 2: Include in Your HTML
```html
<script src="warpmind.js"></script>
```

### Step 3: Get an API Key
1. Go to [OpenAI's website](https://platform.openai.com/api-keys)
2. Create an account and get an API key
3. **Important**: Keep your API key secret!

### Step 4: Start Using
```html
<script>
// Create a new instance
const ai = new Warpmind();

// Set your API key
ai.setApiKey('your-api-key-here');

// Ask a question
ai.ask('What is the capital of France?')
  .then(response => {
    console.log(response); // "The capital of France is Paris."
  })
  .catch(error => {
    console.error('Error:', error);
  });
</script>
```

## Common Use Cases for Students

### 1. Homework Helper
```javascript
const ai = new Warpmind();
ai.setApiKey('your-key');

// Ask for help with homework
const help = await ai.ask('Explain the water cycle in simple terms');
console.log(help);
```

### 2. Code Assistant
```javascript
// Ask for coding help
const codeHelp = await ai.ask('How do I create a for loop in JavaScript?');
console.log(codeHelp);
```

### 3. Writing Assistant
```javascript
// Get help with writing
const writingHelp = await ai.ask('Help me improve this sentence: "The dog was very big"');
console.log(writingHelp);
```

### 4. Language Practice
```javascript
// Practice languages
const spanish = await ai.ask('Translate "Hello, how are you?" to Spanish');
console.log(spanish);
```

## Safety Tips

1. **Never share your API key** - Keep it secret!
2. **Use school proxies** - If your school provides an API proxy, use it
3. **Be mindful of costs** - API calls cost money, so use them wisely
4. **Check your work** - AI can make mistakes, always verify important information

## Complete Example

See `example.html` for a full working example with a nice user interface.

## Need Help?

- Check the main README.md for detailed documentation
- Look at the example.html file for a working demo
- Run `node test.js` to test the library

## Educational Projects Ideas

1. **Study Buddy**: Create a chat interface for homework help
2. **Language Tutor**: Build a language learning assistant
3. **Code Reviewer**: Make a tool that explains code snippets
4. **Writing Coach**: Create a writing improvement tool
5. **Quiz Generator**: Build a tool that creates quiz questions from text

Happy coding! 🚀
