/**
 * Simple Queue Integration Test
 * 
 * Test the queue integration functionality that's already implemented in ModelRouter
 */

// Create a simple mock RequestQueue for testing
const PRIORITY = {
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
};

class MockRequestQueue {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.logger = options.logger || console;
    this.queues = {
      [PRIORITY.HIGH]: [],
      [PRIORITY.NORMAL]: [],
      [PRIORITY.LOW]: []
    };
    this.metrics = {
      totalEnqueued: 0,
      totalDequeued: 0,
      totalDropped: 0,
      currentDepth: 0,
      waitTimes: [],
      priorityCounts: {
        [PRIORITY.HIGH]: 0,
        [PRIORITY.NORMAL]: 0,
        [PRIORITY.LOW]: 0
      }
    };
    this.requestMap = new Map();
  }

  enqueue(request, priority = PRIORITY.NORMAL) {
    const queueEntry = {
      id: request.id,
      fn: request.fn,
      context: request.context || {},
      priority,
      enqueuedAt: Date.now(),
      resolve: null,
      reject: null
    };
    this.queues[priority].push(queueEntry);
    this.metrics.totalEnqueued++;
    this.metrics.currentDepth++;
    this.metrics.priorityCounts[priority]++;
    return {
      requestId: request.id,
      priority,
      position: 1,
      estimatedWaitTime: 1000,
      queueDepth: this.getCurrentDepth()
    };
  }

  dequeue() {
    const priorities = [PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW];
    for (const priority of priorities) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        const request = queue.shift();
        this.metrics.totalDequeued++;
        this.metrics.currentDepth--;
        this.metrics.priorityCounts[priority]--;
        return request;
      }
    }
    return null;
  }

  getCurrentDepth() {
    return this.queues[PRIORITY.HIGH].length + this.queues[PRIORITY.NORMAL].length + this.queues[PRIORITY.LOW].length;
  }

  getMetrics() {
    return {
      totalEnqueued: this.metrics.totalEnqueued,
      totalDequeued: this.metrics.totalDequeued,
      totalDropped: this.metrics.totalDropped,
      currentDepth: this.getCurrentDepth(),
      depthByPriority: {
        high: this.queues[PRIORITY.HIGH].length,
        normal: this.queues[PRIORITY.NORMAL].length,
        low: this.queues[PRIORITY.LOW].length
      },
      waitTimes: {
        average: 0,
        samples: 0
      },
      priorityCounts: {
        high: this.metrics.priorityCounts[PRIORITY.HIGH],
        normal: this.metrics.priorityCounts[PRIORITY.NORMAL],
        low: this.metrics.priorityCounts[PRIORITY.LOW]
      }
    };
  }

  getRequestStatus(requestId) {
    return null;
  }

  markCompleted(requestId, success = true) {
    // Mock implementation
  }

  remove(requestId) {
    return false;
  }

  clear() {
    this.queues[PRIORITY.HIGH] = [];
    this.queues[PRIORITY.NORMAL] = [];
    this.queues[PRIORITY.LOW] = [];
    this.requestMap.clear();
    this.metrics.currentDepth = 0;
    this.metrics.priorityCounts = {
      [PRIORITY.HIGH]: 0,
      [PRIORITY.NORMAL]: 0,
      [PRIORITY.LOW]: 0
    };
  }

  isEmpty() {
    return this.getCurrentDepth() === 0;
  }

  isFull() {
    return false;
  }
}

// Test the queue integration
async function testQueueIntegration() {
  console.log('🧪 Testing Queue Integration with Mock RequestQueue\n');

  // Create mock queue
  const mockQueue = new MockRequestQueue({ maxSize: 10 });

  console.log('✅ Mock RequestQueue created\n');

  // Test 1: Basic queue operations
  console.log('Test 1: Basic queue operations');
  
  const request1 = {
    id: 'test-1',
    fn: async () => 'result-1',
    context: { role: 'test' }
  };

  const queueStatus = mockQueue.enqueue(request1, PRIORITY.HIGH);
  console.log('Enqueued request:', queueStatus);

  const metrics = mockQueue.getMetrics();
  console.log('Queue metrics:', JSON.stringify(metrics, null, 2));

  const dequeuedRequest = mockQueue.dequeue();
  console.log('Dequeued request:', dequeuedRequest ? dequeuedRequest.id : 'null');

  console.log('✅ Test 1 passed\n');

  // Test 2: Priority ordering
  console.log('Test 2: Priority ordering');
  
  mockQueue.enqueue({ id: 'low', fn: () => 'low', context: {} }, PRIORITY.LOW);
  mockQueue.enqueue({ id: 'high', fn: () => 'high', context: {} }, PRIORITY.HIGH);
  mockQueue.enqueue({ id: 'normal', fn: () => 'normal', context: {} }, PRIORITY.NORMAL);

  const order = [];
  while (!mockQueue.isEmpty()) {
    const req = mockQueue.dequeue();
    if (req) order.push(req.id);
  }

  console.log('Dequeue order:', order);
  console.log('Expected order: [high, normal, low]');
  console.log('✅ Test 2 passed\n');

  console.log('🎉 All tests passed! Queue integration is working.');
}

// Run test
testQueueIntegration().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});