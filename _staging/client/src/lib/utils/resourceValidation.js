/**
 * Resource URL Validation and Access Testing Utilities
 * Requirements: 5.2
 */

/**
 * Validate resource URL format based on resource type
 */
export function validateResourceUrl(url, resourceType) {
  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      error: 'URL is required and must be a string'
    };
  }

  try {
    const urlObj = new URL(url);
    
    // Basic URL validation
    if (!urlObj.protocol || !urlObj.hostname) {
      return {
        isValid: false,
        error: 'Invalid URL format'
      };
    }

    // Protocol validation
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return {
        isValid: false,
        error: 'URL must use HTTP or HTTPS protocol'
      };
    }

    // Resource type specific validation
    switch (resourceType) {
      case 'repository':
        return validateRepositoryUrl(urlObj);
      case 'deployment':
        return validateDeploymentUrl(urlObj);
      case 's3':
        return validateS3Url(urlObj);
      case 'database':
        return validateDatabaseUrl(urlObj);
      case 'lambda':
        return validateLambdaUrl(urlObj);
      case 'api':
        return validateApiUrl(urlObj);
      default:
        return validateGenericUrl(urlObj);
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid URL format: ' + error.message
    };
  }
}

/**
 * Validate GitHub repository URL
 */
function validateRepositoryUrl(urlObj) {
  const validHosts = ['github.com', 'gitlab.com', 'bitbucket.org'];
  
  if (!validHosts.includes(urlObj.hostname)) {
    return {
      isValid: false,
      error: 'Repository URL must be from GitHub, GitLab, or Bitbucket'
    };
  }

  // GitHub URL pattern: https://github.com/owner/repo
  if (urlObj.hostname === 'github.com') {
    const pathParts = urlObj.pathname.split('/').filter(part => part);
    if (pathParts.length < 2) {
      return {
        isValid: false,
        error: 'GitHub URL must include owner and repository name'
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate deployment URL (CloudFront, Vercel, etc.)
 */
function validateDeploymentUrl(urlObj) {
  // Common deployment domains
  const deploymentDomains = [
    'cloudfront.net',
    'vercel.app',
    'netlify.app',
    'herokuapp.com',
    'amazonaws.com'
  ];

  const isDeploymentDomain = deploymentDomains.some(domain => 
    urlObj.hostname.includes(domain)
  );

  if (!isDeploymentDomain && !urlObj.hostname.includes('localhost')) {
    return {
      isValid: true, // Allow custom domains
      warning: 'URL does not appear to be from a known deployment platform'
    };
  }

  return { isValid: true };
}

/**
 * Validate S3 bucket URL
 */
function validateS3Url(urlObj) {
  const s3Patterns = [
    /^.*\.s3\..*\.amazonaws\.com$/,
    /^s3\..*\.amazonaws\.com$/,
    /^.*\.s3-website.*\.amazonaws\.com$/
  ];

  const isS3Url = s3Patterns.some(pattern => pattern.test(urlObj.hostname));

  if (!isS3Url) {
    return {
      isValid: false,
      error: 'URL does not appear to be a valid S3 bucket URL'
    };
  }

  return { isValid: true };
}

/**
 * Validate database connection URL
 */
function validateDatabaseUrl(urlObj) {
  const dbProtocols = ['postgres:', 'postgresql:', 'mysql:', 'mongodb:', 'redis:'];
  
  // For HTTP URLs, check if it's a database management interface
  if (['http:', 'https:'].includes(urlObj.protocol)) {
    const dbManagementDomains = [
      'rds.amazonaws.com',
      'dynamodb.',
      'mongodb.com',
      'planetscale.com',
      'supabase.co'
    ];

    const isDbManagement = dbManagementDomains.some(domain => 
      urlObj.hostname.includes(domain)
    );

    if (!isDbManagement) {
      return {
        isValid: true,
        warning: 'URL does not appear to be from a known database service'
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate Lambda function URL
 */
function validateLambdaUrl(urlObj) {
  const lambdaPatterns = [
    /^.*\.lambda-url\..*\.on\.aws$/,
    /^.*\.execute-api\..*\.amazonaws\.com$/
  ];

  const isLambdaUrl = lambdaPatterns.some(pattern => pattern.test(urlObj.hostname));

  if (!isLambdaUrl) {
    return {
      isValid: true,
      warning: 'URL does not appear to be a Lambda function URL'
    };
  }

  return { isValid: true };
}

/**
 * Validate API endpoint URL
 */
function validateApiUrl(urlObj) {
  // API URLs are generally flexible, just ensure basic structure
  if (!urlObj.pathname || urlObj.pathname === '/') {
    return {
      isValid: true,
      warning: 'API URL should typically include a path'
    };
  }

  return { isValid: true };
}

/**
 * Validate generic resource URL
 */
function validateGenericUrl(urlObj) {
  // Basic validation for unknown resource types
  return { isValid: true };
}

/**
 * Test resource accessibility
 */
export async function testResourceAccess(url, resourceType, timeout = 10000) {
  try {
    // For security reasons, we can't make arbitrary cross-origin requests from the browser
    // This would typically be handled by a backend service
    // For now, we'll do basic reachability tests where possible

    switch (resourceType) {
      case 'repository':
        return await testRepositoryAccess(url, timeout);
      case 'deployment':
        return await testDeploymentAccess(url, timeout);
      case 's3':
        return await testS3Access(url, timeout);
      case 'api':
        return await testApiAccess(url, timeout);
      default:
        return await testGenericAccess(url, timeout);
    }
  } catch (error) {
    return {
      isAccessible: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Test repository accessibility
 */
async function testRepositoryAccess(url, timeout) {
  try {
    // For GitHub, we can check if the repository exists by trying to fetch the API
    const urlObj = new URL(url);
    
    if (urlObj.hostname === 'github.com') {
      const pathParts = urlObj.pathname.split('/').filter(part => part);
      if (pathParts.length >= 2) {
        const [owner, repo] = pathParts;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(apiUrl, {
            method: 'HEAD',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          return {
            isAccessible: response.ok,
            error: response.ok ? null : `Repository not accessible (${response.status})`,
            timestamp: new Date().toISOString()
          };
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      }
    }

    // For other git providers, we can't easily test without CORS issues
    return {
      isAccessible: null,
      error: 'Cannot test accessibility for this repository type',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      isAccessible: false,
      error: error.name === 'AbortError' ? 'Request timeout' : error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Test deployment accessibility
 */
async function testDeploymentAccess(url, timeout) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // Try to fetch the deployment URL
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors', // Avoid CORS issues
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      return {
        isAccessible: true, // no-cors mode doesn't give us status
        error: null,
        timestamp: new Date().toISOString()
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // In no-cors mode, network errors still throw
      if (fetchError.name === 'AbortError') {
        return {
          isAccessible: false,
          error: 'Request timeout',
          timestamp: new Date().toISOString()
        };
      }
      
      // Other errors might indicate the resource is not accessible
      return {
        isAccessible: false,
        error: 'Deployment not accessible',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      isAccessible: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Test S3 bucket accessibility
 */
async function testS3Access(url, timeout) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // Try to fetch the S3 URL
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      return {
        isAccessible: true,
        error: null,
        timestamp: new Date().toISOString()
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return {
          isAccessible: false,
          error: 'Request timeout',
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        isAccessible: false,
        error: 'S3 bucket not accessible',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      isAccessible: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Test API accessibility
 */
async function testApiAccess(url, timeout) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // Try to fetch the API URL
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      return {
        isAccessible: true,
        error: null,
        timestamp: new Date().toISOString()
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return {
          isAccessible: false,
          error: 'Request timeout',
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        isAccessible: false,
        error: 'API not accessible',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      isAccessible: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Test generic resource accessibility
 */
async function testGenericAccess(url, timeout) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      return {
        isAccessible: true,
        error: null,
        timestamp: new Date().toISOString()
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return {
          isAccessible: false,
          error: 'Request timeout',
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        isAccessible: false,
        error: 'Resource not accessible',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      isAccessible: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Batch test multiple resources
 */
export async function testMultipleResources(resources, timeout = 10000) {
  const results = await Promise.allSettled(
    resources.map(resource => 
      testResourceAccess(resource.url, resource.type, timeout)
    )
  );

  return resources.map((resource, index) => ({
    resource,
    result: results[index].status === 'fulfilled' 
      ? results[index].value 
      : {
          isAccessible: false,
          error: results[index].reason?.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
  }));
}

/**
 * Get resource health status
 */
export function getResourceHealthStatus(resources) {
  if (!resources || resources.length === 0) {
    return {
      total: 0,
      accessible: 0,
      inaccessible: 0,
      unknown: 0,
      healthPercentage: 0
    };
  }

  let accessible = 0;
  let inaccessible = 0;
  let unknown = 0;

  resources.forEach(resource => {
    // This would typically come from stored validation results
    const lastValidation = resource.metadata?.lastValidation;
    
    if (!lastValidation) {
      unknown++;
    } else if (lastValidation.isAccessible === true) {
      accessible++;
    } else if (lastValidation.isAccessible === false) {
      inaccessible++;
    } else {
      unknown++;
    }
  });

  const total = resources.length;
  const healthPercentage = total > 0 ? Math.round((accessible / total) * 100) : 0;

  return {
    total,
    accessible,
    inaccessible,
    unknown,
    healthPercentage
  };
}