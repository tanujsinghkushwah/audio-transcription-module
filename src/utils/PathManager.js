/**
 * Path Manager - Unified path management for audio transcription system
 * Handles paths for development, production, and packaged environments
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

class PathManager {
  constructor(config = {}) {
    this.config = config;
    this.isPackaged = this.detectPackagedEnvironment();
    this.platform = os.platform();
    this.paths = {};
  }

  /**
   * Initialize and setup all paths
   */
  async initialize() {
    try {
      // Detect if we're running in Electron
      this.isElectron = this.detectElectronEnvironment();
      
      // Setup base paths
      this.setupBasePaths();
      
      // Setup Python paths
      this.setupPythonPaths();
      
      // Setup transcript paths
      this.setupTranscriptPaths();
      
      // Ensure required directories exist
      await this.ensureDirectories();
      
      console.log('PathManager initialized with paths:', this.getAllPaths());
      return true;
    } catch (error) {
      console.error('PathManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Detect if running in a packaged environment
   */
  detectPackagedEnvironment() {
    try {
      if (typeof process.pkg !== 'undefined') {
        return true; // pkg packaged
      }
      
      if (process.mainModule && process.mainModule.filename.indexOf('app.asar') !== -1) {
        return true; // Electron ASAR
      }
      
      if (process.env.NODE_ENV === 'production' && process.execPath.includes('Interview Genie')) {
        return true; // Electron packaged app
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect if running in Electron environment
   */
  detectElectronEnvironment() {
    try {
      // Try to require electron
      const electron = require('electron');
      return !!(electron && (electron.app || electron.remote));
    } catch (error) {
      return false;
    }
  }

  /**
   * Setup base paths for the audio module
   */
  setupBasePaths() {
    if (this.isElectron) {
      try {
        const { app } = require('electron');
        
        if (this.isPackaged) {
          // Packaged Electron app - use userData for working directory
          this.paths.base = app ? app.getPath('userData') : path.join(os.homedir(), 'InterviewGenie');
          this.paths.resources = process.resourcesPath || path.dirname(process.execPath);
          this.paths.audioModule = path.join(this.paths.base, 'audio-transcription-module');
        } else {
          // Development Electron - use current working directory
          this.paths.base = process.cwd();
          this.paths.audioModule = path.join(this.paths.base, 'audio-transcription-module');
          this.paths.resources = this.paths.audioModule;
        }
      } catch (error) {
        console.warn('Failed to get Electron paths, falling back to process paths');
        this.setupFallbackPaths();
      }
    } else {
      this.setupFallbackPaths();
    }
  }

  /**
   * Setup fallback paths when Electron is not available
   */
  setupFallbackPaths() {
    // For Node.js testing, use the current directory structure
    this.paths.base = process.cwd();
    this.paths.audioModule = this.paths.base; // Current directory IS the audio module
    this.paths.resources = this.paths.audioModule;
  }

  /**
   * Setup Python-related paths
   */
  setupPythonPaths() {
    // Python scripts directory - use existing python/ directory
    this.paths.python = path.join(this.paths.audioModule, 'python');
    
    // Embedded runtime directory (for packaged builds)
    this.paths.runtime = path.join(this.paths.audioModule, 'runtime');
    
    // Main Python script
    this.paths.mainScript = path.join(this.paths.python, 'main.py');
    
    // Requirements file
    this.paths.requirements = path.join(this.paths.python, 'requirements.txt');
  }

  /**
   * Setup transcript-related paths
   */
  setupTranscriptPaths() {
    if (this.config.transcriptDirectory) {
      // Use custom transcript directory
      if (path.isAbsolute(this.config.transcriptDirectory)) {
        this.paths.transcripts = this.config.transcriptDirectory;
      } else {
        this.paths.transcripts = path.join(this.paths.audioModule, this.config.transcriptDirectory);
      }
    } else {
      // Default transcript directory
      this.paths.transcripts = path.join(this.paths.audioModule, 'transcripts');
    }
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirsToCreate = [
      this.paths.transcripts // Only create transcripts directory - python directory should already exist
    ];

    // Only create audioModule directory if it doesn't exist and we're in packaged mode
    if (this.isPackaged && !fs.existsSync(this.paths.audioModule)) {
      dirsToCreate.push(this.paths.audioModule);
    }

    for (const dir of dirsToCreate) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        }
      } catch (error) {
        console.warn(`Failed to create directory ${dir}:`, error.message);
      }
    }
  }

  /**
   * Get Python executable path
   */
  getPythonExecutable() {
    // Check for custom Python path
    if (this.config.pythonPath) {
      return this.config.pythonPath;
    }

    // Check for embedded Python runtime
    if (this.isPackaged) {
      const embeddedPython = path.join(this.paths.runtime, 'python-portable', 
        this.platform === 'win32' ? 'python.exe' : 'bin/python3');
      
      if (fs.existsSync(embeddedPython)) {
        console.log('Using embedded Python runtime');
        return embeddedPython;
      }
    }

    // Use system Python
    return this.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Get paths for different components
   */
  getAudioModuleDirectory() {
    return this.paths.audioModule;
  }

  getPythonDirectory() {
    return this.paths.python;
  }

  getTranscriptDirectory() {
    return this.paths.transcripts;
  }

  getMainScriptPath() {
    return this.paths.mainScript;
  }

  getRequirementsPath() {
    return this.paths.requirements;
  }

  /**
   * Get all paths for debugging
   */
  getAllPaths() {
    return {
      ...this.paths,
      pythonExecutable: this.getPythonExecutable(),
      isPackaged: this.isPackaged,
      isElectron: this.isElectron,
      platform: this.platform
    };
  }

  /**
   * Copy Python files from resources to working directory (for packaged builds)
   */
  async copyPythonFiles() {
    if (!this.isPackaged) {
      console.log('Not a packaged build, skipping Python file copy');
      return true;
    }

    try {
      const sourceDir = path.join(this.paths.resources, 'audio-transcription-module', 'python');
      const targetDir = this.paths.python;

      console.log(`Copying Python files from ${sourceDir} to ${targetDir}`);

      if (!fs.existsSync(sourceDir)) {
        console.warn(`Source Python directory not found: ${sourceDir}`);
        return false;
      }

      // Copy all Python files recursively
      await this.copyDirectoryRecursive(sourceDir, targetDir);
      
      console.log('Python files copied successfully');
      return true;
    } catch (error) {
      console.error('Error copying Python files:', error);
      return false;
    }
  }

  /**
   * Recursively copy directory contents
   */
  async copyDirectoryRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

module.exports = PathManager; 