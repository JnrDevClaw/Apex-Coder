const fs = require('fs').promises;
const path = require('path');

/**
 * Artifact Storage Service
 * 
 * Manages storage and retrieval of pipeline artifacts.
 * Currently supports local filesystem storage.
 */
class ArtifactStorage {
    constructor(options = {}) {
        this.baseDir = options.localDir || options.workDir || path.resolve(process.cwd(), 'work');
        this.ensureBaseDir();
    }

    async ensureBaseDir() {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create base artifact directory:', error);
        }
    }

    /**
     * Resolve full path for an artifact
     * @param {string} relativeOrFullPath - Path to resolve
     * @returns {string} Absolute path
     */
    resolvePath(relativeOrFullPath) {
        if (path.isAbsolute(relativeOrFullPath)) {
            return relativeOrFullPath;
        }
        return path.join(this.baseDir, relativeOrFullPath);
    }

    /**
     * Store an artifact
     * @param {string} filePath - Path to store (relative to base or absolute)
     * @param {string|Object} content - Content to store
     */
    async storeArtifact(filePath, content) {
        const fullPath = this.resolvePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        const data = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
        await fs.writeFile(fullPath, data, 'utf8');
        return fullPath;
    }

    /**
     * Read an artifact
     * @param {string} filePath - Path to read
     * @returns {string|Object} Content (parsed JSON if .json)
     */
    async readArtifact(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            const data = await fs.readFile(fullPath, 'utf8');
            if (fullPath.endsWith('.json')) {
                return JSON.parse(data);
            }
            return data;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Artifact not found: ${fullPath}`);
            }
            throw error;
        }
    }

    /**
     * List artifacts in a directory
     * @param {string} dirPath - Directory to list
     */
    async listArtifacts(dirPath) {
        const fullPath = this.resolvePath(dirPath);
        return fs.readdir(fullPath);
    }
}

module.exports = ArtifactStorage;
