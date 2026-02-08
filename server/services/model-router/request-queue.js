const PRIORITY = {
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
};

class RequestQueue {
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
    if (![PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW].includes(priority)) {
      throw new Error(`Invalid priority: ${priority}`);
    }
    if (!request || !request.id || typeof request.fn !== 'function') {
      throw new Error('Request must have id and fn properties');
    }
    const currentSize = this.getCurrentDepth();
    if (currentSize >= this.maxSize) {
      this.metrics.totalDropped++;
      throw new Error(`Request queue full (${currentSize}/${this.maxSize})`);
    }
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
    this.requestMap.set(request.id, {
      priority,
      enqueuedAt: queueEntry.enqueuedAt,
      status: 'queued'
    });
    this.metrics.totalEnqueued++;
    this.metrics.currentDepth++;
    this.metrics.priorityCounts[priority]++;
    const position = this.getQueuePosition(request.id, priority);
    const estimatedWaitTime = this.estimateWaitTime(priority, position);
    return {
      requestId: request.id,
      priority,
      position,
      estimatedWaitTime,
      queueDepth: this.getCurrentDepth()
    };
  }  de
queue() {
    const priorities = [PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW];
    for (const priority of priorities) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        const request = queue.shift();
        const waitTime = Date.now() - request.enqueuedAt;
        this.metrics.waitTimes.push(waitTime);
        if (this.metrics.waitTimes.length > 1000) {
          this.metrics.waitTimes.shift();
        }
        this.metrics.totalDequeued++;
        this.metrics.currentDepth--;
        this.metrics.priorityCounts[priority]--;
        const metadata = this.requestMap.get(request.id);
        if (metadata) {
          metadata.status = 'processing';
          metadata.dequeuedAt = Date.now();
          metadata.waitTime = waitTime;
        }
        return request;
      }
    }
    return null;
  }

  getCurrentDepth() {
    return this.queues[PRIORITY.HIGH].length + this.queues[PRIORITY.NORMAL].length + this.queues[PRIORITY.LOW].length;
  }

  getDepthByPriority(priority) {
    return this.queues[priority]?.length || 0;
  }

  getQueuePosition(requestId, priority) {
    let position = 0;
    if (priority === PRIORITY.NORMAL) {
      position += this.queues[PRIORITY.HIGH].length;
    } else if (priority === PRIORITY.LOW) {
      position += this.queues[PRIORITY.HIGH].length;
      position += this.queues[PRIORITY.NORMAL].length;
    }
    const queue = this.queues[priority];
    const index = queue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      position += index + 1;
    }
    return position;
  }

  estimateWaitTime(priority, position) {
    const avgWaitTime = this.getAverageWaitTime();
    const baseEstimate = avgWaitTime > 0 ? avgWaitTime : 5000;
    return position * baseEstimate;
  }

  getAverageWaitTime() {
    if (this.metrics.waitTimes.length === 0) {
      return 0;
    }
    const sum = this.metrics.waitTimes.reduce((acc, time) => acc + time, 0);
    return Math.round(sum / this.metrics.waitTimes.length);
  } 
 getMetrics() {
    return {
      totalEnqueued: this.metrics.totalEnqueued,
      totalDequeued: this.metrics.totalDequeued,
      totalDropped: this.metrics.totalDropped,
      currentDepth: this.getCurrentDepth(),
      depthByPriority: {
        high: this.getDepthByPriority(PRIORITY.HIGH),
        normal: this.getDepthByPriority(PRIORITY.NORMAL),
        low: this.getDepthByPriority(PRIORITY.LOW)
      },
      waitTimes: {
        average: this.getAverageWaitTime(),
        samples: this.metrics.waitTimes.length
      },
      priorityCounts: {
        high: this.metrics.priorityCounts[PRIORITY.HIGH],
        normal: this.metrics.priorityCounts[PRIORITY.NORMAL],
        low: this.metrics.priorityCounts[PRIORITY.LOW]
      }
    };
  }

  getRequestStatus(requestId) {
    const metadata = this.requestMap.get(requestId);
    if (!metadata) {
      return null;
    }
    const result = {
      requestId,
      status: metadata.status,
      priority: metadata.priority,
      enqueuedAt: metadata.enqueuedAt
    };
    if (metadata.status === 'queued') {
      result.position = this.getQueuePosition(requestId, metadata.priority);
      result.estimatedWaitTime = this.estimateWaitTime(metadata.priority, result.position);
    }
    if (metadata.dequeuedAt) {
      result.dequeuedAt = metadata.dequeuedAt;
      result.waitTime = metadata.waitTime;
    }
    return result;
  }

  markCompleted(requestId, success = true) {
    const metadata = this.requestMap.get(requestId);
    if (metadata) {
      metadata.status = success ? 'completed' : 'failed';
      metadata.completedAt = Date.now();
      if (metadata.dequeuedAt) {
        metadata.processingTime = metadata.completedAt - metadata.dequeuedAt;
      }
      setTimeout(() => {
        this.requestMap.delete(requestId);
      }, 60000);
    }
  } 
 remove(requestId) {
    for (const priority of [PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW]) {
      const queue = this.queues[priority];
      const index = queue.findIndex(req => req.id === requestId);
      if (index !== -1) {
        queue.splice(index, 1);
        this.metrics.currentDepth--;
        this.metrics.priorityCounts[priority]--;
        this.requestMap.delete(requestId);
        return true;
      }
    }
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
    return this.getCurrentDepth() >= this.maxSize;
  }
}

module.exports = RequestQueue;
module.exports.PRIORITY = PRIORITY;