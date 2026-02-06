/**
 * CodeParser Service
 * 
 * Parses LLM responses to extract code blocks, patches, and other structured content.
 * Validates parsed content to ensure it's usable for code generation and debugging.
 * 
 * Requirements: 3.2, 4.3
 */

class CodeParser {
  /**
   * Parse LLM response into files with paths and content
   * Supports multiple code block formats:
   * - ```filename:path/to/file.js
   * - ```javascript:path/to/file.js
   * - ```path/to/file.js
   * 
   * @param {string} response - LLM response containing code blocks
   * @returns {Array<{path: string, content: string, language?: string}>} Parsed files
   */
  parseCodeResponse(response) {
    if (!response || typeof response !== 'string') {
      return [];
    }

    const files = [];
    
    // Match code blocks with various formats
    // Supports: ```filename:path, ```language:path, ```path
    const codeBlockRegex = /```(?:(?:filename|[\w]+):)?([^\n]+)\n([\s\S]*?)```/g;
    
    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const [, pathOrLang, content] = match;
      
      // Clean up the path/filename
      const cleanPath = pathOrLang.trim();
      
      // Skip if it looks like just a language identifier without a path
      if (this._isLanguageOnly(cleanPath)) {
        continue;
      }
      
      // Extract language if present
      const language = this._extractLanguage(cleanPath);
      
      files.push({
        path: this._cleanPath(cleanPath),
        content: content.trim(),
        language
      });
    }
    
    return files;
  }

  /**
   * Parse patch/diff from LLM response for debugging
   * Extracts git-style patches from code blocks
   * 
   * @param {string} response - LLM response containing patch
   * @returns {string|null} Extracted patch or null if not found
   */
  parsePatch(response) {
    if (!response || typeof response !== 'string') {
      return null;
    }

    // Match patch blocks with various formats
    const patchRegex = /```(?:patch|diff)\n([\s\S]*?)```/;
    const match = response.match(patchRegex);
    
    if (!match) {
      return null;
    }
    
    const patch = match[1].trim();
    
    // Validate patch format
    if (!this._isValidPatch(patch)) {
      return null;
    }
    
    return patch;
  }

  /**
   * Validate parsed files
   * Ensures files have valid paths and non-empty content
   * 
   * @param {Array<{path: string, content: string}>} files - Parsed files
   * @returns {{valid: boolean, errors: Array<string>}} Validation result
   */
  validateFiles(files) {
    const errors = [];
    
    if (!Array.isArray(files)) {
      return { valid: false, errors: ['Files must be an array'] };
    }
    
    if (files.length === 0) {
      return { valid: false, errors: ['No files found in response'] };
    }
    
    files.forEach((file, index) => {
      if (!file.path || typeof file.path !== 'string') {
        errors.push(`File ${index}: Missing or invalid path`);
      }
      
      if (!file.content || typeof file.content !== 'string') {
        errors.push(`File ${index}: Missing or invalid content`);
      }
      
      if (file.path && this._hasInvalidPathCharacters(file.path)) {
        errors.push(`File ${index}: Path contains invalid characters: ${file.path}`);
      }
      
      if (file.content && file.content.trim().length === 0) {
        errors.push(`File ${index}: Content is empty: ${file.path}`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate patch content
   * Ensures patch has valid git diff format
   * 
   * @param {string} patch - Patch content
   * @returns {{valid: boolean, errors: Array<string>}} Validation result
   */
  validatePatch(patch) {
    const errors = [];
    
    if (!patch || typeof patch !== 'string') {
      return { valid: false, errors: ['Patch is empty or invalid'] };
    }
    
    if (!this._isValidPatch(patch)) {
      errors.push('Patch does not have valid git diff format');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract multiple patches from response
   * Useful when LLM returns multiple file patches
   * 
   * @param {string} response - LLM response
   * @returns {Array<{file: string, patch: string}>} Array of patches
   */
  parseMultiplePatches(response) {
    if (!response || typeof response !== 'string') {
      return [];
    }

    const patches = [];
    const patchRegex = /```(?:patch|diff)\n([\s\S]*?)```/g;
    
    let match;
    while ((match = patchRegex.exec(response)) !== null) {
      const patchContent = match[1].trim();
      
      if (this._isValidPatch(patchContent)) {
        // Try to extract filename from patch
        const fileMatch = patchContent.match(/diff --git a\/(.*?) b\//);
        const file = fileMatch ? fileMatch[1] : 'unknown';
        
        patches.push({
          file,
          patch: patchContent
        });
      }
    }
    
    return patches;
  }

  /**
   * Parse JSON from LLM response
   * Extracts and validates JSON blocks
   * 
   * @param {string} response - LLM response
   * @returns {Object|null} Parsed JSON or null
   */
  parseJSON(response) {
    if (!response || typeof response !== 'string') {
      return null;
    }

    // Try to find JSON in code blocks first
    const jsonBlockRegex = /```(?:json)?\n([\s\S]*?)```/;
    const match = response.match(jsonBlockRegex);
    
    let jsonStr = match ? match[1] : response;
    
    try {
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      // Try to extract JSON object from text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          return null;
        }
      }
      return null;
    }
  }

  // Private helper methods

  _isLanguageOnly(str) {
    const languageKeywords = [
      'javascript', 'typescript', 'python', 'java', 'go', 'rust',
      'ruby', 'php', 'swift', 'kotlin', 'c', 'cpp', 'csharp',
      'html', 'css', 'sql', 'bash', 'shell', 'json', 'yaml', 'xml'
    ];
    
    const lower = str.toLowerCase().trim();
    return languageKeywords.includes(lower) && !str.includes('/') && !str.includes('.');
  }

  _extractLanguage(pathStr) {
    const ext = pathStr.split('.').pop()?.toLowerCase();
    
    const langMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'html': 'html',
      'css': 'css',
      'sql': 'sql',
      'sh': 'bash',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml'
    };
    
    return langMap[ext] || ext;
  }

  _cleanPath(pathStr) {
    // Remove language prefix if present (e.g., "javascript:path/to/file.js" -> "path/to/file.js")
    const colonIndex = pathStr.indexOf(':');
    if (colonIndex > 0 && colonIndex < 20) {
      pathStr = pathStr.substring(colonIndex + 1);
    }
    
    return pathStr.trim();
  }

  _hasInvalidPathCharacters(path) {
    // Check for obviously invalid characters in file paths
    const invalidChars = /[<>"|?*\x00-\x1f]/;
    return invalidChars.test(path);
  }

  _isValidPatch(patch) {
    // Check for basic git diff format markers
    const hasDiffHeader = /diff --git/.test(patch);
    const hasFileMarkers = /---.*\n\+\+\+/.test(patch);
    const hasHunks = /@@ -\d+,?\d* \+\d+,?\d* @@/.test(patch);
    
    return hasDiffHeader || (hasFileMarkers && hasHunks);
  }
}

module.exports = CodeParser;
