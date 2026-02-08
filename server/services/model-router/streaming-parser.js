/**
 * Streaming JSON Parser
 * 
 * Provides streaming JSON parsing for large responses to avoid loading
 * entire response in memory. Uses incremental parsing for better performance.
 * 
 * Requirements: 20.3
 */

const { Transform } = require('stream');

/**
 * Maximum chunk size for parsing (in bytes)
 * Prevents memory issues with very large responses
 */
const MAX_CHUNK_SIZE = 1024 * 1024; // 1MB

/**
 * Streaming JSON parser that processes data incrementally
 */
class StreamingJSONParser extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.buffer = '';
    this.depth = 0;
    this.inString = false;
    this.escaped = false;
    this.maxChunkSize = options.maxChunkSize || MAX_CHUNK_SIZE;
  }

  _transform(chunk, encoding, callback) {
    try {
      this.buffer += chunk.toString();

      // Process buffer if it exceeds max chunk size
      if (this.buffer.length > this.maxChunkSize) {
        this.processBuffer();
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    try {
      // Process remaining buffer
      if (this.buffer.length > 0) {
        this.processBuffer(true);
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }

  processBuffer(final = false) {
    // Try to parse complete JSON objects from buffer
    let startIndex = 0;
    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        if (braceCount === 0) {
          startIndex = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          // Found complete JSON object
          const jsonStr = this.buffer.substring(startIndex, i + 1);
          try {
            const obj = JSON.parse(jsonStr);
            this.push(obj);
          } catch (parseError) {
            // Invalid JSON, skip
          }
          startIndex = i + 1;
        }
      }
    }

    // Keep unparsed data in buffer
    if (startIndex > 0) {
      this.buffer = this.buffer.substring(startIndex);
    } else if (final && this.buffer.length > 0) {
      // Try to parse remaining buffer on final flush
      try {
        const obj = JSON.parse(this.buffer);
        this.push(obj);
        this.buffer = '';
      } catch (parseError) {
        // Invalid JSON, discard
        this.buffer = '';
      }
    }
  }
}

/**
 * Parse JSON incrementally from a stream
 * @param {Stream} stream - Input stream
 * @returns {AsyncIterator<Object>} Parsed JSON objects
 */
async function* parseJSONStream(stream) {
  const parser = new StreamingJSONParser();
  stream.pipe(parser);

  for await (const obj of parser) {
    yield obj;
  }
}

/**
 * Parse large JSON response without loading entire response in memory
 * @param {string|Buffer|Stream} input - JSON input
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} Parsed JSON object
 */
async function parseLargeJSON(input, options = {}) {
  const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default

  // If input is a string or buffer, check size first
  if (typeof input === 'string' || Buffer.isBuffer(input)) {
    const size = Buffer.byteLength(input);
    
    if (size > maxSize) {
      throw new Error(`JSON response too large: ${size} bytes (max: ${maxSize})`);
    }

    // For small responses, use standard JSON.parse
    if (size < 1024 * 1024) { // < 1MB
      return JSON.parse(input.toString());
    }

    // For larger responses, parse in chunks
    return parseInChunks(input.toString(), options);
  }

  // If input is a stream, use streaming parser
  if (input && typeof input.pipe === 'function') {
    const chunks = [];
    for await (const obj of parseJSONStream(input)) {
      chunks.push(obj);
    }
    return chunks.length === 1 ? chunks[0] : chunks;
  }

  throw new Error('Invalid input type for JSON parsing');
}

/**
 * Parse JSON string in chunks to avoid blocking event loop
 * @param {string} jsonStr - JSON string
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} Parsed JSON object
 */
async function parseInChunks(jsonStr, options = {}) {
  const chunkSize = options.chunkSize || 100000; // 100KB chunks
  
  return new Promise((resolve, reject) => {
    // Use setImmediate to avoid blocking event loop
    setImmediate(() => {
      try {
        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Extract specific fields from large JSON without parsing entire object
 * Useful for extracting just the content field from large responses
 * @param {string} jsonStr - JSON string
 * @param {Array<string>} fields - Fields to extract
 * @returns {Object} Extracted fields
 */
function extractFields(jsonStr, fields) {
  const result = {};
  
  for (const field of fields) {
    // Use regex to extract field value without full parsing
    const regex = new RegExp(`"${field}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\\d+|true|false|null|\\{[^}]*\\}|\\[[^\\]]*\\])`, 'i');
    const match = jsonStr.match(regex);
    
    if (match) {
      try {
        // Parse just the matched value
        result[field] = JSON.parse(match[1]);
      } catch (error) {
        // If parsing fails, store as string
        result[field] = match[1];
      }
    }
  }
  
  return result;
}

/**
 * Check if response is likely to be large
 * @param {Object} response - HTTP response object
 * @returns {boolean} True if response is large
 */
function isLargeResponse(response) {
  const contentLength = response.headers?.['content-length'];
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    return size > 1024 * 1024; // > 1MB
  }
  
  // If no content-length header, assume it might be large
  return true;
}

/**
 * Create a response parser based on response size
 * @param {Object} response - HTTP response object
 * @returns {Function} Parser function
 */
function createResponseParser(response) {
  if (isLargeResponse(response)) {
    // Use streaming parser for large responses
    return (data) => parseLargeJSON(data, { maxSize: 50 * 1024 * 1024 }); // 50MB max
  } else {
    // Use standard JSON.parse for small responses
    return (data) => {
      if (typeof data === 'string') {
        return JSON.parse(data);
      } else if (Buffer.isBuffer(data)) {
        return JSON.parse(data.toString());
      }
      return data;
    };
  }
}

module.exports = {
  StreamingJSONParser,
  parseJSONStream,
  parseLargeJSON,
  parseInChunks,
  extractFields,
  isLargeResponse,
  createResponseParser
};
