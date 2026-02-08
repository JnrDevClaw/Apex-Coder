/**
 * Clipboard Utility Functions
 * Provides cross-browser clipboard functionality with fallbacks
 * Requirements: 5.4
 */

/**
 * Copy text to clipboard using modern Clipboard API with fallback
 */
export async function copyToClipboard(text) {
  if (!text || typeof text !== 'string') {
    console.warn('copyToClipboard: Invalid text provided');
    return false;
  }

  try {
    // Try modern Clipboard API first (requires HTTPS or localhost)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback to legacy method
    return copyToClipboardLegacy(text);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    
    // Try legacy method as fallback
    try {
      return copyToClipboardLegacy(text);
    } catch (fallbackError) {
      console.error('Legacy clipboard method also failed:', fallbackError);
      return false;
    }
  }
}

/**
 * Legacy clipboard copy method using document.execCommand
 */
function copyToClipboardLegacy(text) {
  try {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    textarea.style.opacity = '0';
    textarea.setAttribute('readonly', '');
    
    document.body.appendChild(textarea);
    
    // Select and copy the text
    textarea.select();
    textarea.setSelectionRange(0, 99999); // For mobile devices
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    return successful;
  } catch (error) {
    console.error('Legacy clipboard copy failed:', error);
    return false;
  }
}

/**
 * Copy resource URL with formatted text
 */
export async function copyResourceUrl(resource) {
  if (!resource || !resource.url) {
    return false;
  }

  const text = `${resource.name}: ${resource.url}`;
  return await copyToClipboard(text);
}

/**
 * Copy resource metadata as formatted JSON
 */
export async function copyResourceMetadata(resource) {
  if (!resource || !resource.metadata) {
    return false;
  }

  try {
    const formattedMetadata = JSON.stringify(resource.metadata, null, 2);
    return await copyToClipboard(formattedMetadata);
  } catch (error) {
    console.error('Failed to format resource metadata:', error);
    return false;
  }
}

/**
 * Copy all resources as a formatted list
 */
export async function copyAllResources(resources) {
  if (!resources || !Array.isArray(resources) || resources.length === 0) {
    return false;
  }

  try {
    const resourceList = resources.map(resource => {
      const metadata = resource.metadata ? 
        Object.entries(resource.metadata)
          .map(([key, value]) => `  ${key}: ${value}`)
          .join('\n') : '';
      
      return `${resource.name} (${resource.type})
URL: ${resource.url}${metadata ? '\nMetadata:\n' + metadata : ''}`;
    }).join('\n\n');

    const text = `Generated Resources (${resources.length})\n\n${resourceList}`;
    return await copyToClipboard(text);
  } catch (error) {
    console.error('Failed to format resources list:', error);
    return false;
  }
}

/**
 * Copy resources grouped by type
 */
export async function copyResourcesByType(resources) {
  if (!resources || !Array.isArray(resources) || resources.length === 0) {
    return false;
  }

  try {
    // Group resources by type
    const grouped = resources.reduce((acc, resource) => {
      if (!acc[resource.type]) {
        acc[resource.type] = [];
      }
      acc[resource.type].push(resource);
      return acc;
    }, {});

    // Format grouped resources
    const sections = Object.entries(grouped).map(([type, typeResources]) => {
      const resourceList = typeResources.map(resource => 
        `  • ${resource.name}: ${resource.url}`
      ).join('\n');
      
      return `${type.toUpperCase()} (${typeResources.length})\n${resourceList}`;
    }).join('\n\n');

    const text = `Generated Resources by Type\n\n${sections}`;
    return await copyToClipboard(text);
  } catch (error) {
    console.error('Failed to format grouped resources:', error);
    return false;
  }
}

/**
 * Copy resource as markdown link
 */
export async function copyResourceAsMarkdown(resource) {
  if (!resource || !resource.url || !resource.name) {
    return false;
  }

  const markdownLink = `[${resource.name}](${resource.url})`;
  return await copyToClipboard(markdownLink);
}

/**
 * Copy multiple resources as markdown links
 */
export async function copyResourcesAsMarkdown(resources) {
  if (!resources || !Array.isArray(resources) || resources.length === 0) {
    return false;
  }

  try {
    const markdownLinks = resources.map(resource => 
      `- [${resource.name}](${resource.url}) (${resource.type})`
    ).join('\n');

    const text = `## Generated Resources\n\n${markdownLinks}`;
    return await copyToClipboard(text);
  } catch (error) {
    console.error('Failed to format markdown links:', error);
    return false;
  }
}

/**
 * Check if clipboard API is available
 */
export function isClipboardSupported() {
  return !!(navigator.clipboard || document.execCommand);
}

/**
 * Check if modern clipboard API is available
 */
export function isModernClipboardSupported() {
  return !!(navigator.clipboard && window.isSecureContext);
}

/**
 * Get clipboard permissions status
 */
export async function getClipboardPermissions() {
  if (!navigator.permissions || !navigator.clipboard) {
    return { state: 'unsupported' };
  }

  try {
    const permission = await navigator.permissions.query({ name: 'clipboard-write' });
    return { state: permission.state };
  } catch (error) {
    console.warn('Could not query clipboard permissions:', error);
    return { state: 'unknown' };
  }
}

/**
 * Copy with user feedback
 */
export async function copyWithFeedback(text, successMessage = 'Copied to clipboard', errorMessage = 'Failed to copy') {
  const success = await copyToClipboard(text);
  
  // This would typically integrate with a notification system
  if (success) {
    console.log(successMessage);
    // You could dispatch a custom event here for UI feedback
    window.dispatchEvent(new CustomEvent('clipboard-success', { 
      detail: { message: successMessage } 
    }));
  } else {
    console.error(errorMessage);
    window.dispatchEvent(new CustomEvent('clipboard-error', { 
      detail: { message: errorMessage } 
    }));
  }
  
  return success;
}

/**
 * Copy formatted resource information
 */
export async function copyFormattedResource(resource, format = 'text') {
  if (!resource) {
    return false;
  }

  switch (format) {
    case 'url':
      return await copyResourceUrl(resource);
    case 'metadata':
      return await copyResourceMetadata(resource);
    case 'markdown':
      return await copyResourceAsMarkdown(resource);
    case 'json':
      return await copyToClipboard(JSON.stringify(resource, null, 2));
    case 'text':
    default:
      const text = `${resource.name}
Type: ${resource.type}
URL: ${resource.url}${resource.metadata ? '\nMetadata: ' + JSON.stringify(resource.metadata, null, 2) : ''}`;
      return await copyToClipboard(text);
  }
}