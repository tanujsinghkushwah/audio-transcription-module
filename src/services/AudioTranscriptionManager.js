/**
 * Audio Transcription Manager
 * Manages Python processes and transcription lifecycle internally
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

class AudioTranscriptionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDependencyChecks: process.env.AUDIO_DEPENDENCY_CHECKS_ENABLED !== 'false',
      transcriptsDir: options.transcriptsDir || this.getTranscriptDirectory(),
      pythonScript: options.pythonScript || 'main.py',
      ...options
    };
    
    // State tracking
    this.initialized = false;
    this.running = false;
    this.pythonProcess = null;
    this.transcriptCallback = null;
    this.micEnabled = false;
    
    // File watching
    this.currentTranscriptFile = null;
    this.lastFileSize = 0;
    this.watchInterval = null;
  }

  /**
   * Get the proper transcript directory path
   */
  getTranscriptDirectory() {
    try {
      const { app } = require('electron');
      const isPackaged = app && app.isPackaged;
      
      if (isPackaged) {
        return path.join(app.getPath('userData'), 'audio-transcription-module', 'transcripts');
      } else {
        return path.join(process.cwd(), 'audio-transcription-module', 'transcripts');
      }
    } catch (error) {
      // Fallback for non-electron environments
      return path.join(__dirname, '..', '..', 'transcripts');
    }
  }

  /**
   * Get the audio module directory
   */
  getAudioModuleDirectory() {
    try {
      const { app } = require('electron');
      const isPackaged = app && app.isPackaged;
      
      if (isPackaged) {
        return path.join(app.getPath('userData'), 'audio-transcription-module');
      } else {
        return path.join(process.cwd(), 'audio-transcription-module');
      }
    } catch (error) {
      // Fallback for non-electron environments
      return path.join(__dirname, '..', '..');
    }
  }

  /**
   * Initialize the audio transcription manager
   * @returns {Promise<Object>} Result with success status
   */
  async initialize() {
    try {
      if (this.initialized) {
        return { success: true, message: 'Already initialized' };
      }

      // Create transcripts directory
      if (!fs.existsSync(this.options.transcriptsDir)) {
        fs.mkdirSync(this.options.transcriptsDir, { recursive: true });
      }

      // Copy files if in packaged mode
      await this.ensureFilesAvailable();

      // Check dependencies if enabled
      if (this.options.enableDependencyChecks) {
        const depsResult = await this.checkAndInstallDependencies();
        if (!depsResult) {
          console.warn('[AudioManager] Some dependencies may be missing, but will continue');
        }
      }

      this.initialized = true;
      this.emit('manager.initialized');
      
      return { success: true, message: 'Initialized successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Start the transcription process
   * @returns {Promise<Object>} Result with success status
   */
  async start() {
    try {
      if (this.running) {
        return { success: true, message: 'Already running' };
      }

      if (!this.initialized) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return initResult;
        }
      }

      // Try to use enhanced startup module first
      const startupPath = path.join(this.getAudioModuleDirectory(), 'startup.js');
      if (fs.existsSync(startupPath)) {
        try {
          const audioStartup = require(startupPath);
          const result = await audioStartup.start();
          
          if (result && result.success) {
            this.pythonProcess = result.process;
            this.running = true;
            this._startWatching();
            this.emit('transcription.started', { method: 'enhanced-startup' });
            return { success: true, message: 'Started via enhanced startup' };
          }
        } catch (enhancedError) {
          console.warn('[AudioManager] Enhanced startup failed, falling back to direct method');
        }
      }

      // Fallback to direct Python process management
      const processResult = await this._startPythonProcess();
      if (processResult.success) {
        this.running = true;
        this._startWatching();
        this.emit('transcription.started', { method: 'direct-python' });
        return { success: true, message: 'Started via direct Python process' };
      }

      return processResult;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop the transcription process
   * @returns {Promise<Object>} Result with success status
   */
  async stop() {
    try {
      if (!this.running) {
        return { success: true, message: 'Not running' };
      }

      this._stopWatching();

      if (this.pythonProcess) {
        await this._stopPythonProcess();
      }

      this.running = false;
      this.emit('transcription.stopped');
      
      return { success: true, message: 'Stopped successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set transcript callback
   */
  setTranscriptCallback(callback) {
    this.transcriptCallback = callback;
    this.emit('callback.set', { hasCallback: typeof callback === 'function' });
  }

  /**
   * Set microphone enabled state
   */
  setMicEnabled(enabled) {
    this.micEnabled = enabled === true;
    this.emit('mic.state.changed', { enabled: this.micEnabled });
  }

  /**
   * Get current transcript file
   */
  getCurrentTranscriptFile() {
    return this.currentTranscriptFile;
  }

  /**
   * Clear all transcripts
   */
  async clearTranscripts() {
    try {
      if (fs.existsSync(this.options.transcriptsDir)) {
        const files = fs.readdirSync(this.options.transcriptsDir)
          .filter(file => file.startsWith('transcript_'));
        
        for (const file of files) {
          fs.unlinkSync(path.join(this.options.transcriptsDir, file));
        }
      }
      
      this.emit('transcripts.cleared');
      return true;
    } catch (error) {
      this.emit('transcription.error', error);
      return false;
    }
  }

  /**
   * Start Python process directly
   */
  async _startPythonProcess() {
    try {
      const audioModuleDir = this.getAudioModuleDirectory();
      const scriptPath = path.join(audioModuleDir, this.options.pythonScript);
      
      if (!fs.existsSync(scriptPath)) {
        return { success: false, error: `Python script not found: ${scriptPath}` };
      }

      const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
      
      const spawnOptions = {
        cwd: audioModuleDir,
        env: { 
          ...process.env, 
          PYTHONIOENCODING: 'utf-8', 
          PYTHONUNBUFFERED: '1' 
        },
        shell: process.platform === 'win32'
      };
      
      this.pythonProcess = spawn(pythonPath, [scriptPath], spawnOptions);
      
      // Set up event handlers
      this.pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.emit('python.stdout', { output });
      });
      
      this.pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        this.emit('python.stderr', { output });
        
        // Check for specific errors
        if (output.includes('ModuleNotFoundError')) {
          this.emit('transcription.error', { type: 'missing-module', output });
        }
      });
      
      this.pythonProcess.on('close', (code) => {
        this.emit('python.closed', { code });
        this.running = false;
        this.pythonProcess = null;
      });
      
      this.pythonProcess.on('error', (error) => {
        this.emit('transcription.error', { type: 'spawn-error', error: error.message });
      });
      
      // Wait a moment to ensure process started successfully
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (this.pythonProcess && !this.pythonProcess.killed) {
        return { success: true, process: this.pythonProcess };
      } else {
        return { success: false, error: 'Process failed to start or terminated immediately' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop Python process
   */
  async _stopPythonProcess() {
    if (!this.pythonProcess) return;

    try {
      if (process.platform === 'win32') {
        // Windows-specific termination
        const { execSync } = require('child_process');
        try {
          execSync(`taskkill /T /PID ${this.pythonProcess.pid}`, { 
            timeout: 3000, 
            stdio: 'ignore' 
          });
        } catch (taskKillError) {
          this.pythonProcess.kill('SIGKILL');
        }
      } else {
        // Unix-like systems
        this.pythonProcess.kill('SIGTERM');
        
        // Force kill after 2 seconds if still running
        setTimeout(() => {
          if (this.pythonProcess && !this.pythonProcess.killed) {
            this.pythonProcess.kill('SIGKILL');
          }
        }, 2000);
      }
    } catch (error) {
      console.warn('[AudioManager] Error stopping Python process:', error.message);
    }

    this.pythonProcess = null;
  }

  /**
   * Start file watching for transcripts
   */
  _startWatching() {
    if (this.watchInterval) return;

    this.watchInterval = setInterval(() => {
      this._checkForNewTranscriptFiles();
      this._processFileUpdates();
    }, 1000);

    this.emit('watching.started');
  }

  /**
   * Stop file watching
   */
  _stopWatching() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    this.emit('watching.stopped');
  }

  /**
   * Check for new transcript files
   */
  _checkForNewTranscriptFiles() {
    try {
      if (!fs.existsSync(this.options.transcriptsDir)) return;

      const files = fs.readdirSync(this.options.transcriptsDir)
        .filter(file => file.startsWith('transcript_'))
        .sort()
        .reverse();

      if (files.length > 0) {
        const newestFile = path.join(this.options.transcriptsDir, files[0]);
        
        if (!this.currentTranscriptFile || newestFile !== this.currentTranscriptFile) {
          this.currentTranscriptFile = newestFile;
          this.lastFileSize = 0;
          this.emit('transcript.file.changed', { file: this.currentTranscriptFile });
        }
      }
    } catch (error) {
      this.emit('transcription.error', { type: 'file-check', error: error.message });
    }
  }

  /**
   * Process updates to current transcript file
   */
  _processFileUpdates() {
    try {
      if (!this.currentTranscriptFile || !fs.existsSync(this.currentTranscriptFile)) return;

      const stats = fs.statSync(this.currentTranscriptFile);
      
      if (stats.size > this.lastFileSize) {
        const buffer = Buffer.alloc(stats.size - this.lastFileSize);
        const fd = fs.openSync(this.currentTranscriptFile, 'r');
        fs.readSync(fd, buffer, 0, buffer.length, this.lastFileSize);
        fs.closeSync(fd);
        
        const newContent = buffer.toString('utf8');
        this.lastFileSize = stats.size;
        
        if (newContent && this.transcriptCallback) {
          this._processTranscriptContent(newContent);
        }
        
        this.emit('transcript.detected', { content: newContent });
      }
    } catch (error) {
      this.emit('transcription.error', { type: 'file-update', error: error.message });
    }
  }

  /**
   * Process transcript content and call callback
   */
  _processTranscriptContent(content) {
    if (!this.micEnabled || !this.transcriptCallback) return;

    // Parse transcript lines similar to current implementation
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const match = line.match(/(?:Speaker|You)\[([^\]]+)\]:\s*\[([^\]]+)\]/);
      
      if (match && match.length >= 3) {
        const timestamp = match[1];
        const transcript = match[2].trim();
        
        if (transcript && transcript.length > 0) {
          // Simple question detection heuristic
          const isQuestion = this._detectQuestion(transcript);
          
          const transcriptData = {
            transcript,
            timestamp: new Date(timestamp).toISOString(),
            isQuestion,
            questionConfidence: isQuestion ? 0.8 : 0.2,
            isFinal: true,
            source: 'audio-module-transcript',
            platform: line.startsWith('You') ? 'macOS' : 'Windows'
          };
          
          this.transcriptCallback(transcriptData);
          this.emit('transcript.processed', transcriptData);
        }
      }
    }
  }

  /**
   * Simple question detection
   */
  _detectQuestion(text) {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
    const questionPhrases = ['can you', 'could you', 'would you', 'will you', 'do you', 'did you', 'have you', 'are you', 'is there'];
    const lowerText = text.toLowerCase();
    
    return text.endsWith('?') ||
           questionWords.some(word => lowerText.startsWith(word)) ||
           questionPhrases.some(phrase => lowerText.startsWith(phrase)) ||
           lowerText.includes('explain') ||
           lowerText.includes('describe') ||
           lowerText.includes('tell me');
  }

  /**
   * Ensure files are available (copy from resources if packaged)
   */
  async ensureFilesAvailable() {
    try {
      const { app } = require('electron');
      if (!app || !app.isPackaged) return true;

      const sourceDir = path.join(process.resourcesPath, 'audio-transcription-module');
      const targetDir = this.getAudioModuleDirectory();

      if (!fs.existsSync(sourceDir)) return true;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Copy essential files only (not the entire directory to avoid performance issues)
      const essentialFiles = ['main.py', 'main_enhanced.py', 'startup.js', 'python-runner.js', 'requirements.txt'];
      
      for (const file of essentialFiles) {
        const srcFile = path.join(sourceDir, file);
        const destFile = path.join(targetDir, file);
        
        if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
          fs.copyFileSync(srcFile, destFile);
        }
      }

      return true;
    } catch (error) {
      console.warn('[AudioManager] Error ensuring files available:', error.message);
      return false;
    }
  }

  /**
   * Check and install dependencies
   */
  async checkAndInstallDependencies() {
    // Simplified dependency checking - detailed implementation would go here
    // For now, just return true to avoid blocking startup
    return true;
  }
}

module.exports = AudioTranscriptionManager; 