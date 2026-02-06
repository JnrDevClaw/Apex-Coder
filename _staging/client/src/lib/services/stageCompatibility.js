/**
 * Stage Compatibility Layer
 * Provides backward compatibility for existing stage definitions and legacy formats
 * Requirements: 4.4
 */

import { STAGE_STATUS } from '../schemas/pipeline.js';
import { stageRegistry } from './stageRegistry.js';

/**
 * Legacy stage format mappings
 */
const LEGACY_STATUS_MAPPINGS = {
  // Old status names -> new status names
  'success': STAGE_STATUS.DONE,
  'complete': STAGE_STATUS.DONE,
  'finished': STAGE_STATUS.DONE,
  'fail': STAGE_STATUS.FAILED,
  'failure': STAGE_STATUS.FAILED,
  'err': STAGE_STATUS.ERROR,
  'stop': STAGE_STATUS.CANCELLED,
  'stopped': STAGE_STATUS.CANCELLED,
  'abort': STAGE_STATUS.CANCELLED,
  'aborted': STAGE_STATUS.CANCELLED,
  'skip': STAGE_STATUS.CANCELLED,
  'skipped': STAGE_STATUS.CANCELLED
};

const LEGACY_FIELD_MAPPINGS = {
  // Old field names -> new field names
  'name': 'label',
  'title': 'label',
  'desc': 'description',
  'summary': 'description',
  'multiEvent': 'supportsMultipleEvents',
  'hasMultipleEvents': 'supportsMultipleEvents',
  'allowMultiple': 'supportsMultipleEvents',
  'validStatuses': 'allowedStatuses',
  'statuses': 'allowedStatuses',
  'allowedStates': 'allowedStatuses',
  'deps': 'dependencies',
  'requires': 'dependencies',
  'prerequisite': 'dependencies',
  'prerequisites': 'dependencies',
  'timeoutMs': 'timeout',
  'timeoutSeconds': 'timeout',
  'canRetry': 'retryable',
  'isRetryable': 'retryable',
  'allowRetry': 'retryable',
  'isCritical': 'critical',
  'required': 'critical',
  'essential': 'critical'
};

/**
 * Compatibility layer class
 */
export class StageCompatibilityLayer {
  constructor() {
    this.migrations = new Map();
    this.deprecationWarnings = new Set();
    this.initializeMigrations();
  }

  /**
   * Initialize migration functions
   */
  initializeMigrations() {
    // Version 1.0 -> 2.0 migration
    this.addMigration('1.0', '2.0', this.migrateV1ToV2.bind(this));
    
    // Legacy format -> current format migration
    this.addMigration('legacy', 'current', this.migrateLegacyToCurrent.bind(this));
  }

  /**
   * Add a migration function
   */
  addMigration(fromVersion, toVersion, migrationFunction) {
    const key = `${fromVersion}->${toVersion}`;
    this.migrations.set(key, migrationFunction);
  }

  /**
   * Normalize legacy stage definition to current format
   */
  normalizeStageDefinition(stageDefinition) {
    if (!stageDefinition || typeof stageDefinition !== 'object') {
      return stageDefinition;
    }

    // Create a copy to avoid mutating original
    let normalized = { ...stageDefinition };

    // Detect and migrate legacy formats
    normalized = this.detectAndMigrateLegacyFormat(normalized);

    // Apply field mappings
    normalized = this.applyFieldMappings(normalized);

    // Normalize status values
    normalized = this.normalizeStatusValues(normalized);

    // Apply default values for missing fields
    normalized = this.applyDefaults(normalized);

    // Validate and fix common issues
    normalized = this.fixCommonIssues(normalized);

    return normalized;
  }

  /**
   * Detect and migrate legacy stage formats
   */
  detectAndMigrateLegacyFormat(stageDefinition) {
    // Check for legacy format indicators
    const legacyIndicators = [
      'name', 'title', 'desc', 'multiEvent', 'validStatuses', 'deps', 'timeoutMs'
    ];

    const hasLegacyFields = legacyIndicators.some(field => field in stageDefinition);
    
    if (hasLegacyFields) {
      this.addDeprecationWarning('legacy-format', 'Legacy stage format detected. Please update to current format.');
      return this.migrateLegacyToCurrent(stageDefinition);
    }

    // Check for version-specific migrations
    if (stageDefinition.version) {
      const version = stageDefinition.version;
      if (version === '1.0') {
        return this.migrateV1ToV2(stageDefinition);
      }
    }

    return stageDefinition;
  }

  /**
   * Apply field name mappings
   */
  applyFieldMappings(stageDefinition) {
    const mapped = { ...stageDefinition };

    for (const [oldField, newField] of Object.entries(LEGACY_FIELD_MAPPINGS)) {
      if (oldField in mapped && !(newField in mapped)) {
        mapped[newField] = mapped[oldField];
        delete mapped[oldField];
        this.addDeprecationWarning(`field-${oldField}`, `Field '${oldField}' is deprecated. Use '${newField}' instead.`);
      }
    }

    return mapped;
  }

  /**
   * Normalize status values
   */
  normalizeStatusValues(stageDefinition) {
    const normalized = { ...stageDefinition };

    // Normalize allowedStatuses array
    if (normalized.allowedStatuses && Array.isArray(normalized.allowedStatuses)) {
      normalized.allowedStatuses = normalized.allowedStatuses.map(status => {
        const normalizedStatus = LEGACY_STATUS_MAPPINGS[status] || status;
        if (LEGACY_STATUS_MAPPINGS[status]) {
          this.addDeprecationWarning(`status-${status}`, `Status '${status}' is deprecated. Use '${normalizedStatus}' instead.`);
        }
        return normalizedStatus;
      });
    }

    // Normalize current status if present
    if (normalized.status && LEGACY_STATUS_MAPPINGS[normalized.status]) {
      const oldStatus = normalized.status;
      normalized.status = LEGACY_STATUS_MAPPINGS[oldStatus];
      this.addDeprecationWarning(`status-${oldStatus}`, `Status '${oldStatus}' is deprecated. Use '${normalized.status}' instead.`);
    }

    return normalized;
  }

  /**
   * Apply default values for missing required fields
   */
  applyDefaults(stageDefinition) {
    const withDefaults = { ...stageDefinition };

    // Apply defaults for required fields
    if (!withDefaults.supportsMultipleEvents) {
      withDefaults.supportsMultipleEvents = false;
    }

    if (!withDefaults.allowedStatuses || !Array.isArray(withDefaults.allowedStatuses)) {
      withDefaults.allowedStatuses = [
        STAGE_STATUS.PENDING,
        STAGE_STATUS.RUNNING,
        STAGE_STATUS.DONE,
        STAGE_STATUS.ERROR,
        STAGE_STATUS.CANCELLED
      ];
    }

    // Apply defaults for optional fields
    if (withDefaults.dependencies === undefined) {
      withDefaults.dependencies = [];
    }

    if (withDefaults.timeout === undefined) {
      withDefaults.timeout = 300000; // 5 minutes
    }

    if (withDefaults.retryable === undefined) {
      withDefaults.retryable = true;
    }

    if (withDefaults.critical === undefined) {
      withDefaults.critical = false;
    }

    if (!withDefaults.version) {
      withDefaults.version = '1.0.0';
    }

    if (!withDefaults.category) {
      withDefaults.category = 'general';
    }

    if (!withDefaults.icon) {
      withDefaults.icon = 'default';
    }

    if (!withDefaults.metadata) {
      withDefaults.metadata = {};
    }

    return withDefaults;
  }

  /**
   * Fix common issues in stage definitions
   */
  fixCommonIssues(stageDefinition) {
    const fixed = { ...stageDefinition };

    // Fix ID format issues
    if (fixed.id && typeof fixed.id === 'string') {
      // Convert to lowercase and replace invalid characters
      const originalId = fixed.id;
      fixed.id = fixed.id.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (fixed.id !== originalId) {
        this.addDeprecationWarning(`id-format`, `Stage ID '${originalId}' was normalized to '${fixed.id}'. Use lowercase letters, numbers, underscores, and hyphens only.`);
      }
    }

    // Fix timeout format (convert seconds to milliseconds if needed)
    if (fixed.timeout && fixed.timeout < 1000) {
      // Assume it's in seconds, convert to milliseconds
      fixed.timeout = fixed.timeout * 1000;
      this.addDeprecationWarning('timeout-format', 'Timeout values should be in milliseconds. Converted from seconds.');
    }

    // Ensure allowedStatuses includes required statuses
    if (fixed.allowedStatuses && Array.isArray(fixed.allowedStatuses)) {
      if (!fixed.allowedStatuses.includes(STAGE_STATUS.PENDING)) {
        fixed.allowedStatuses.unshift(STAGE_STATUS.PENDING);
        this.addDeprecationWarning('missing-pending', 'Added "pending" status as it is required for all stages.');
      }

      // Remove duplicates
      fixed.allowedStatuses = [...new Set(fixed.allowedStatuses)];
    }

    // Fix dependencies format
    if (fixed.dependencies && !Array.isArray(fixed.dependencies)) {
      if (typeof fixed.dependencies === 'string') {
        fixed.dependencies = [fixed.dependencies];
        this.addDeprecationWarning('dependencies-format', 'Dependencies should be an array. Converted string to array.');
      } else {
        fixed.dependencies = [];
        this.addDeprecationWarning('dependencies-format', 'Invalid dependencies format. Reset to empty array.');
      }
    }

    return fixed;
  }

  /**
   * Migrate version 1.0 to 2.0
   */
  migrateV1ToV2(stageDefinition) {
    const migrated = { ...stageDefinition };

    // V1 to V2 specific changes
    if (migrated.hasEvents !== undefined) {
      migrated.supportsMultipleEvents = migrated.hasEvents;
      delete migrated.hasEvents;
    }

    if (migrated.statusList !== undefined) {
      migrated.allowedStatuses = migrated.statusList;
      delete migrated.statusList;
    }

    migrated.version = '2.0.0';
    return migrated;
  }

  /**
   * Migrate legacy format to current format
   */
  migrateLegacyToCurrent(stageDefinition) {
    const migrated = { ...stageDefinition };

    // Handle legacy event format
    if (migrated.events && Array.isArray(migrated.events)) {
      migrated.supportsMultipleEvents = migrated.events.length > 0;
    }

    // Handle legacy payload format
    if (migrated.payload && !migrated.expectedPayloadSchema) {
      migrated.expectedPayloadSchema = this.inferPayloadSchema(migrated.payload);
    }

    // Set version to current
    migrated.version = '2.0.0';
    
    return migrated;
  }

  /**
   * Infer payload schema from example payload
   */
  inferPayloadSchema(payload) {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    const schema = {};
    
    for (const [key, value] of Object.entries(payload)) {
      schema[key] = {
        type: Array.isArray(value) ? 'array' : typeof value,
        required: false // Conservative default
      };

      // Add additional constraints based on value
      if (typeof value === 'string') {
        schema[key].maxLength = Math.max(100, value.length * 2);
      } else if (typeof value === 'number') {
        schema[key].min = 0;
      }
    }

    return schema;
  }

  /**
   * Normalize stage instance (runtime stage object)
   */
  normalizeStageInstance(stageInstance) {
    if (!stageInstance || typeof stageInstance !== 'object') {
      return stageInstance;
    }

    const normalized = { ...stageInstance };

    // Normalize status
    if (normalized.status && LEGACY_STATUS_MAPPINGS[normalized.status]) {
      normalized.status = LEGACY_STATUS_MAPPINGS[normalized.status];
    }

    // Normalize events
    if (normalized.events && Array.isArray(normalized.events)) {
      normalized.events = normalized.events.map(event => this.normalizeEventInstance(event));
    }

    // Ensure required fields exist
    if (!normalized.events) {
      normalized.events = [];
    }

    if (!normalized.error) {
      normalized.error = null;
    }

    return normalized;
  }

  /**
   * Normalize event instance
   */
  normalizeEventInstance(eventInstance) {
    if (!eventInstance || typeof eventInstance !== 'object') {
      return eventInstance;
    }

    const normalized = { ...eventInstance };

    // Normalize status
    if (normalized.status && LEGACY_STATUS_MAPPINGS[normalized.status]) {
      normalized.status = LEGACY_STATUS_MAPPINGS[normalized.status];
    }

    // Ensure required fields
    if (!normalized.id) {
      normalized.id = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!normalized.timestamp) {
      normalized.timestamp = new Date().toISOString();
    }

    if (!normalized.details) {
      normalized.details = {};
    }

    return normalized;
  }

  /**
   * Check if stage definition needs migration
   */
  needsMigration(stageDefinition) {
    if (!stageDefinition || typeof stageDefinition !== 'object') {
      return false;
    }

    // Check for legacy field names
    const legacyFields = Object.keys(LEGACY_FIELD_MAPPINGS);
    const hasLegacyFields = legacyFields.some(field => field in stageDefinition);

    // Check for legacy status values
    const hasLegacyStatuses = stageDefinition.allowedStatuses && 
      Array.isArray(stageDefinition.allowedStatuses) &&
      stageDefinition.allowedStatuses.some(status => status in LEGACY_STATUS_MAPPINGS);

    // Check version
    const needsVersionMigration = !stageDefinition.version || 
      stageDefinition.version === '1.0' || 
      stageDefinition.version === 'legacy';

    return hasLegacyFields || hasLegacyStatuses || needsVersionMigration;
  }

  /**
   * Get migration path for a stage definition
   */
  getMigrationPath(stageDefinition) {
    const path = [];

    if (!stageDefinition.version || stageDefinition.version === 'legacy') {
      path.push('legacy -> current');
    } else if (stageDefinition.version === '1.0') {
      path.push('1.0 -> 2.0');
    }

    return path;
  }

  /**
   * Add deprecation warning
   */
  addDeprecationWarning(key, message) {
    this.deprecationWarnings.add(`${key}: ${message}`);
  }

  /**
   * Get all deprecation warnings
   */
  getDeprecationWarnings() {
    return Array.from(this.deprecationWarnings);
  }

  /**
   * Clear deprecation warnings
   */
  clearDeprecationWarnings() {
    this.deprecationWarnings.clear();
  }

  /**
   * Create compatibility report
   */
  createCompatibilityReport(stageDefinitions) {
    const report = {
      totalStages: stageDefinitions.length,
      needsMigration: 0,
      migrationPaths: {},
      deprecationWarnings: [],
      recommendations: []
    };

    stageDefinitions.forEach((stage, index) => {
      if (this.needsMigration(stage)) {
        report.needsMigration++;
        
        const paths = this.getMigrationPath(stage);
        paths.forEach(path => {
          report.migrationPaths[path] = (report.migrationPaths[path] || 0) + 1;
        });
      }
    });

    // Add deprecation warnings
    report.deprecationWarnings = this.getDeprecationWarnings();

    // Generate recommendations
    if (report.needsMigration > 0) {
      report.recommendations.push(`${report.needsMigration} stages need migration to current format`);
    }

    if (report.deprecationWarnings.length > 0) {
      report.recommendations.push('Update deprecated field names and status values');
    }

    return report;
  }

  /**
   * Batch migrate multiple stage definitions
   */
  batchMigrate(stageDefinitions) {
    const results = {
      migrated: [],
      errors: [],
      warnings: []
    };

    stageDefinitions.forEach((stage, index) => {
      try {
        const migrated = this.normalizeStageDefinition(stage);
        results.migrated.push(migrated);
      } catch (error) {
        results.errors.push({
          index,
          stage: stage.id || `stage-${index}`,
          error: error.message
        });
        // Add original stage as fallback
        results.migrated.push(stage);
      }
    });

    // Add deprecation warnings
    results.warnings = this.getDeprecationWarnings();

    return results;
  }

  /**
   * Register stage with compatibility layer
   */
  registerStageWithCompatibility(stageDefinition) {
    try {
      // Normalize the stage definition
      const normalized = this.normalizeStageDefinition(stageDefinition);
      
      // Register with stage registry
      return stageRegistry.registerStage(normalized);
    } catch (error) {
      console.warn(`Failed to register stage with compatibility layer:`, error);
      throw error;
    }
  }
}

// Create singleton instance
export const stageCompatibility = new StageCompatibilityLayer();

export default stageCompatibility;