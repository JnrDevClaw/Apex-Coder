class TestFailureDetector {
  constructor() {
    this.patterns = {
      jest: {
        failureIndicators: [
          /FAIL\s+(.+)/,
          /Tests:\s+\d+\s+failed/,
          /expect\(.*\)\..*\s+Expected:/,
          /Error:\s+(.+)/
        ],
        testNamePattern: /^\s*✕\s+(.+)/,
        errorPattern: /Error:\s+(.+)/,
        stackTracePattern: /at\s+(.+)\s+\((.+):(\d+):(\d+)\)/
      },
      pytest: {
        failureIndicators: [
          /FAILED\s+(.+)/,
          /AssertionError:\s+(.+)/,
          /E\s+assert\s+(.+)/,
          /ERROR\s+(.+)/
        ],
        testNamePattern: /^(.+\.py)::\w+::\w+\s+FAILED/,
        errorPattern: /AssertionError:\s+(.+)/,
        stackTracePattern: /File\s+"(.+)",\s+line\s+(\d+),\s+in\s+(.+)/
      },
      go: {
        failureIndicators: [
          /FAIL:\s+(.+)/,
          /panic:\s+(.+)/,
          /--- FAIL:\s+(.+)/,
          /got\s+(.+),\s+want\s+(.+)/
        ],
        testNamePattern: /--- FAIL:\s+(\w+)/,
        errorPattern: /Error:\s+(.+)/,
        stackTracePattern: /(.+):(\d+)\s+\+0x[a-f0-9]+/
      },
      generic: {
        failureIndicators: [
          /error/i,
          /fail/i,
          /exception/i,
          /assertion/i
        ],
        testNamePattern: /test.*fail/i,
        errorPattern: /error:\s*(.+)/i,
        stackTracePattern: /at\s+(.+)/
      }
    };
  }

  detectFailures(testOutput, framework = 'generic') {
    const patterns = this.patterns[framework] || this.patterns.generic;
    
    const analysis = {
      hasFailures: false,
      framework,
      failingTests: [],
      errors: [],
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0
      },
      stackTraces: [],
      suggestions: []
    };

    // Split output into lines for analysis
    const lines = testOutput.split('\n');
    
    // Check for failure indicators
    analysis.hasFailures = this.hasFailureIndicators(lines, patterns);
    
    if (analysis.hasFailures) {
      // Extract failing tests
      analysis.failingTests = this.extractFailingTests(lines, patterns);
      
      // Extract errors
      analysis.errors = this.extractErrors(lines, patterns);
      
      // Extract stack traces
      analysis.stackTraces = this.extractStackTraces(lines, patterns);
      
      // Parse test summary
      analysis.summary = this.parseTestSummary(lines, framework);
      
      // Generate suggestions
      analysis.suggestions = this.generateSuggestions(analysis);
    }

    return analysis;
  }

  hasFailureIndicators(lines, patterns) {
    return lines.some(line => 
      patterns.failureIndicators.some(pattern => pattern.test(line))
    );
  }

  extractFailingTests(lines, patterns) {
    const failingTests = [];
    
    for (const line of lines) {
      const match = line.match(patterns.testNamePattern);
      if (match) {
        failingTests.push({
          name: match[1],
          line: line.trim()
        });
      }
    }
    
    return failingTests;
  }

  extractErrors(lines, patterns) {
    const errors = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(patterns.errorPattern);
      
      if (match) {
        const error = {
          message: match[1],
          line: line.trim(),
          context: []
        };
        
        // Get surrounding context
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        error.context = lines.slice(start, end).map(l => l.trim());
        
        errors.push(error);
      }
    }
    
    return errors;
  }

  extractStackTraces(lines, patterns) {
    const stackTraces = [];
    let currentTrace = null;
    
    for (const line of lines) {
      const match = line.match(patterns.stackTracePattern);
      
      if (match) {
        if (!currentTrace) {
          currentTrace = {
            frames: [],
            error: null
          };
        }
        
        currentTrace.frames.push({
          file: match[1] || match[2],
          line: match[2] || match[3],
          column: match[3] || match[4],
          function: match[4] || match[1],
          raw: line.trim()
        });
      } else if (currentTrace && line.trim() === '') {
        // End of stack trace
        stackTraces.push(currentTrace);
        currentTrace = null;
      } else if (currentTrace && patterns.errorPattern.test(line)) {
        currentTrace.error = line.trim();
      }
    }
    
    // Add final trace if exists
    if (currentTrace) {
      stackTraces.push(currentTrace);
    }
    
    return stackTraces;
  }

  parseTestSummary(lines, framework) {
    const summary = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0
    };

    switch (framework) {
      case 'jest':
        return this.parseJestSummary(lines, summary);
      case 'pytest':
        return this.parsePytestSummary(lines, summary);
      case 'go':
        return this.parseGoSummary(lines, summary);
      default:
        return this.parseGenericSummary(lines, summary);
    }
  }

  parseJestSummary(lines, summary) {
    for (const line of lines) {
      // Jest summary format: "Tests: 1 failed, 4 passed, 5 total"
      const testMatch = line.match(/Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(\d+)\s+total/);
      if (testMatch) {
        summary.failedTests = parseInt(testMatch[1]) || 0;
        summary.passedTests = parseInt(testMatch[2]) || 0;
        summary.skippedTests = parseInt(testMatch[3]) || 0;
        summary.totalTests = parseInt(testMatch[4]) || 0;
        break;
      }
    }
    return summary;
  }

  parsePytestSummary(lines, summary) {
    for (const line of lines) {
      // Pytest summary format: "= 1 failed, 4 passed in 2.34s ="
      const testMatch = line.match(/=+\s*(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+skipped,?\s*)?/);
      if (testMatch) {
        summary.failedTests = parseInt(testMatch[1]) || 0;
        summary.passedTests = parseInt(testMatch[2]) || 0;
        summary.skippedTests = parseInt(testMatch[3]) || 0;
        summary.totalTests = summary.failedTests + summary.passedTests + summary.skippedTests;
        break;
      }
    }
    return summary;
  }

  parseGoSummary(lines, summary) {
    for (const line of lines) {
      // Go test summary format: "FAIL	package/name	0.123s"
      if (line.startsWith('FAIL')) {
        summary.failedTests++;
      } else if (line.startsWith('PASS')) {
        summary.passedTests++;
      }
    }
    summary.totalTests = summary.failedTests + summary.passedTests;
    return summary;
  }

  parseGenericSummary(lines, summary) {
    // Try to find any numeric patterns that might indicate test counts
    for (const line of lines) {
      const numbers = line.match(/\d+/g);
      if (numbers && line.toLowerCase().includes('test')) {
        // Heuristic: assume the largest number is total tests
        const maxNumber = Math.max(...numbers.map(n => parseInt(n)));
        if (maxNumber > summary.totalTests) {
          summary.totalTests = maxNumber;
        }
      }
    }
    return summary;
  }

  generateSuggestions(analysis) {
    const suggestions = [];
    
    // Analyze common error patterns
    for (const error of analysis.errors) {
      const message = error.message.toLowerCase();
      
      if (message.includes('cannot find module') || message.includes('modulenotfounderror')) {
        suggestions.push({
          type: 'dependency',
          message: 'Missing dependency detected',
          action: 'Install missing dependencies or check import paths',
          confidence: 0.9
        });
      } else if (message.includes('syntax error') || message.includes('syntaxerror')) {
        suggestions.push({
          type: 'syntax',
          message: 'Syntax error detected',
          action: 'Check code syntax and fix parsing errors',
          confidence: 0.95
        });
      } else if (message.includes('assertion') || message.includes('expected')) {
        suggestions.push({
          type: 'logic',
          message: 'Assertion failure detected',
          action: 'Review test expectations and implementation logic',
          confidence: 0.8
        });
      } else if (message.includes('timeout') || message.includes('timed out')) {
        suggestions.push({
          type: 'performance',
          message: 'Timeout detected',
          action: 'Optimize code performance or increase timeout limits',
          confidence: 0.7
        });
      } else if (message.includes('connection') || message.includes('network')) {
        suggestions.push({
          type: 'network',
          message: 'Network/connection issue detected',
          action: 'Check network connectivity and service availability',
          confidence: 0.8
        });
      }
    }

    // Analyze stack traces for common issues
    for (const trace of analysis.stackTraces) {
      if (trace.frames.some(frame => frame.file && frame.file.includes('node_modules'))) {
        suggestions.push({
          type: 'dependency',
          message: 'Error in dependency code',
          action: 'Check dependency versions and compatibility',
          confidence: 0.6
        });
      }
    }

    // Remove duplicate suggestions
    const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
      index === self.findIndex(s => s.type === suggestion.type && s.message === suggestion.message)
    );

    return uniqueSuggestions;
  }

  categorizeFailure(analysis) {
    const { errors, suggestions, summary } = analysis;
    
    // Determine primary failure category
    if (suggestions.some(s => s.type === 'syntax')) {
      return {
        category: 'syntax_error',
        severity: 'high',
        fixable: true,
        description: 'Code contains syntax errors that prevent execution'
      };
    }
    
    if (suggestions.some(s => s.type === 'dependency')) {
      return {
        category: 'dependency_error',
        severity: 'medium',
        fixable: true,
        description: 'Missing or incompatible dependencies'
      };
    }
    
    if (suggestions.some(s => s.type === 'logic')) {
      return {
        category: 'logic_error',
        severity: 'medium',
        fixable: true,
        description: 'Business logic or test assertion errors'
      };
    }
    
    if (suggestions.some(s => s.type === 'performance')) {
      return {
        category: 'performance_error',
        severity: 'low',
        fixable: true,
        description: 'Performance-related timeouts or resource issues'
      };
    }
    
    if (suggestions.some(s => s.type === 'network')) {
      return {
        category: 'network_error',
        severity: 'low',
        fixable: false,
        description: 'Network connectivity or external service issues'
      };
    }
    
    // Default category for unclassified failures
    return {
      category: 'unknown_error',
      severity: 'medium',
      fixable: true,
      description: 'Unclassified test failure'
    };
  }

  generateFixPriority(analysis) {
    const category = this.categorizeFailure(analysis);
    const { errors, summary } = analysis;
    
    let priority = 50; // Base priority
    
    // Adjust based on severity
    switch (category.severity) {
      case 'high':
        priority += 30;
        break;
      case 'medium':
        priority += 10;
        break;
      case 'low':
        priority -= 10;
        break;
    }
    
    // Adjust based on failure ratio
    if (summary.totalTests > 0) {
      const failureRatio = summary.failedTests / summary.totalTests;
      priority += Math.round(failureRatio * 20);
    }
    
    // Adjust based on fixability
    if (!category.fixable) {
      priority -= 20;
    }
    
    // Adjust based on error count
    priority += Math.min(errors.length * 5, 20);
    
    return Math.max(0, Math.min(100, priority));
  }
}

module.exports = TestFailureDetector;