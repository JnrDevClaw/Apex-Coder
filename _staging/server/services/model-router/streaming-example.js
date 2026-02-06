/**
 * Streaming Usage Example
 * 
 * This file demonstrates how to use the ModelRouter streaming functionality
 * for real-time AI response generation.
 */

const ModelRouter = require('./model-router');
const providerRegistry = require('./provider-registry');
const config = require('../../config/model-router-config');
const metricsCollector = require('./metrics-collector');
const costTracker = require('./cost-tracker');
const tokenTracker = require('./token-tracker');

// Initialize router with all tracking enabled
const router = new ModelRouter({
  registry: providerRegistry,
  config: config,
  logger: console,
  metricsCollector,
  costTracker,
  tokenTracker
});

/**
 * Example 1: Basic streaming with console output
 */
async function basicStreamingExample() {
  console.log('\n=== Example 1: Basic Streaming ===\n');

  const messages = [
    { role: 'user', content: 'Write a short story about a robot learning to paint.' }
  ];

  try {
    console.log('Starting stream...\n');
    
    for await (const chunk of router.stream('normalizer', messages, {
      projectId: 'example-project',
      userId: 'example-user',
      maxTokens: 500
    })) {
      if (chunk.done) {
        // Final metadata
        console.log('\n\n--- Stream Complete ---');
        console.log('Total tokens:', chunk.metadata.tokens.total);
        console.log('Cost: $' + chunk.metadata.cost.toFixed(6));
        console.log('Time:', chunk.metadata.latency + 'ms');
        console.log('Chunks:', chunk.metadata.chunkCount);
      } else {
        // Content chunk - print without newline
        process.stdout.write(chunk.content);
      }
    }
  } catch (error) {
    console.error('\nError:', error.message);
  }
}

/**
 * Example 2: Streaming with progress tracking
 */
async function streamingWithProgress() {
  console.log('\n=== Example 2: Streaming with Progress ===\n');

  const messages = [
    { role: 'user', content: 'Explain how neural networks work in simple terms.' }
  ];

  try {
    let chunkCount = 0;
    let totalContent = '';
    const startTime = Date.now();
    
    for await (const chunk of router.stream('normalizer', messages, {
      projectId: 'progress-example',
      maxTokens: 1000
    })) {
      if (chunk.done) {
        console.log('\n\n--- Final Statistics ---');
        console.log('Chunks received:', chunkCount);
        console.log('Content length:', totalContent.length);
        console.log('Total tokens:', chunk.metadata.tokens.total);
        console.log('Input tokens:', chunk.metadata.tokens.input);
        console.log('Output tokens:', chunk.metadata.tokens.output);
        console.log('Cost: $' + chunk.metadata.cost.toFixed(6));
        console.log('Latency:', chunk.metadata.latency + 'ms');
        console.log('Tokens/second:', 
          (chunk.metadata.tokens.output / (chunk.metadata.latency / 1000)).toFixed(2)
        );
      } else {
        chunkCount++;
        totalContent += chunk.content;
        
        // Show progress every 10 chunks
        if (chunkCount % 10 === 0) {
          const elapsed = Date.now() - startTime;
          console.log(`\n[Progress: ${chunkCount} chunks, ${chunk.tokens.output} tokens, ${elapsed}ms]`);
        }
        
        process.stdout.write(chunk.content);
      }
    }
  } catch (error) {
    console.error('\nError:', error.message);
  }
}

/**
 * Example 3: Streaming with error handling
 */
async function streamingWithErrorHandling() {
  console.log('\n=== Example 3: Streaming with Error Handling ===\n');

  const messages = [
    { role: 'user', content: 'Generate some code.' }
  ];

  try {
    let fullContent = '';
    let lastChunk = null;
    
    for await (const chunk of router.stream('code-generator', messages, {
      projectId: 'error-example',
      maxTokens: 500
    })) {
      if (chunk.done) {
        console.log('\n\nStream completed successfully!');
        console.log('Metadata:', JSON.stringify(chunk.metadata, null, 2));
      } else {
        lastChunk = chunk;
        fullContent += chunk.content;
        process.stdout.write(chunk.content);
      }
    }
    
    return fullContent;
  } catch (error) {
    console.error('\n\n--- Error Occurred ---');
    console.error('Message:', error.message);
    console.error('Provider:', error.provider);
    console.error('Model:', error.model);
    console.error('Latency:', error.latency + 'ms');
    
    // You could return partial content here if needed
    return null;
  }
}

/**
 * Example 4: Streaming to a buffer/array
 */
async function streamingToBuffer() {
  console.log('\n=== Example 4: Streaming to Buffer ===\n');

  const messages = [
    { role: 'user', content: 'List 5 interesting facts about space.' }
  ];

  const chunks = [];
  let metadata = null;

  try {
    for await (const chunk of router.stream('normalizer', messages, {
      projectId: 'buffer-example',
      maxTokens: 300
    })) {
      if (chunk.done) {
        metadata = chunk.metadata;
      } else {
        chunks.push({
          content: chunk.content,
          tokens: chunk.tokens,
          chunkIndex: chunk.chunkIndex,
          timestamp: Date.now()
        });
      }
    }

    console.log('Collected', chunks.length, 'chunks');
    console.log('Total content length:', chunks.reduce((sum, c) => sum + c.content.length, 0));
    console.log('Metadata:', metadata);
    
    // Reconstruct full content
    const fullContent = chunks.map(c => c.content).join('');
    console.log('\nFull content:\n', fullContent);
    
    return { chunks, metadata, fullContent };
  } catch (error) {
    console.error('Error:', error.message);
    return { chunks, metadata: null, fullContent: null };
  }
}

/**
 * Example 5: Streaming with custom processing
 */
async function streamingWithProcessing() {
  console.log('\n=== Example 5: Streaming with Custom Processing ===\n');

  const messages = [
    { role: 'user', content: 'Write a poem about technology.' }
  ];

  try {
    let wordCount = 0;
    let lineCount = 0;
    
    for await (const chunk of router.stream('normalizer', messages, {
      projectId: 'processing-example',
      maxTokens: 400
    })) {
      if (chunk.done) {
        console.log('\n\n--- Analysis ---');
        console.log('Approximate words:', wordCount);
        console.log('Approximate lines:', lineCount);
        console.log('Tokens:', chunk.metadata.tokens.total);
        console.log('Cost: $' + chunk.metadata.cost.toFixed(6));
      } else {
        // Count words and lines as they arrive
        wordCount += chunk.content.split(/\s+/).filter(w => w.length > 0).length;
        lineCount += (chunk.content.match(/\n/g) || []).length;
        
        process.stdout.write(chunk.content);
      }
    }
  } catch (error) {
    console.error('\nError:', error.message);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Model Router Streaming Examples                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await basicStreamingExample();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between examples
    
    await streamingWithProgress();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await streamingWithErrorHandling();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await streamingToBuffer();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await streamingWithProcessing();
    
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  All examples completed!                                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Export examples for use in other modules
module.exports = {
  basicStreamingExample,
  streamingWithProgress,
  streamingWithErrorHandling,
  streamingToBuffer,
  streamingWithProcessing,
  runAllExamples
};

// Run examples if executed directly
if (require.main === module) {
  runAllExamples()
    .then(() => {
      console.log('\nExamples finished successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error running examples:', error);
      process.exit(1);
    });
}
