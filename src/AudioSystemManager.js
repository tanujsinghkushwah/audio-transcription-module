/**
 * Audio System Manager - Manages Python process lifecycle
 * Handles starting, stopping, and monitoring the Python transcription process
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class AudioSystemManager extends EventEmitter {
  constructor(config, pathManager) {
    super();
    this.config = config;
    this.pathManager = pathManager;
    this.pythonProcess = null;
    this.isRunning = false;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.processStartTime = null;
  }

  /**
   * Initialize the audio system manager
   */
  async initialize() {
    try {
      console.log('Initializing AudioSystemManager...');
      
      // Ensure Python files are available
      await this.ensurePythonFiles();
      
      // Verify Python scripts exist
      await this.verifyPythonScripts();
      
      console.log('AudioSystemManager initialized successfully');
      return true;
    } catch (error) {
      console.error('AudioSystemManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure Python files are available (copy from resources if needed)
   */
  async ensurePythonFiles() {
    try {
      // For packaged builds, copy Python files from resources
      if (this.pathManager.isPackaged) {
        const copySuccess = await this.pathManager.copyPythonFiles();
        if (!copySuccess) {
          console.warn('Failed to copy Python files, will try to use existing files');
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error ensuring Python files:', error);
      return false;
    }
  }

  /**
   * Verify required Python scripts exist
   */
  async verifyPythonScripts() {
    const requiredScripts = [
      'main.py',
      'AudioTranscriber.py',
      'AudioRecorder.py',
      'TranscriberModels.py'
    ];

    const pythonDir = this.pathManager.getPythonDirectory();
    const missingScripts = [];

    for (const script of requiredScripts) {
      const scriptPath = path.join(pythonDir, script);
      if (!fs.existsSync(scriptPath)) {
        missingScripts.push(script);
      }
    }

    if (missingScripts.length > 0) {
      throw new Error(`Required Python scripts not found: ${missingScripts.join(', ')}`);
    }

    console.log('All required Python scripts verified');
    return true;
  }

  /**
   * Start the Python transcription process
   */
  async start() {
    if (this.isRunning) {
      console.log('Python transcription process already running');
      return true;
    }

    try {
      const pythonExecutable = this.pathManager.getPythonExecutable();
      const mainScript = this.pathManager.getMainScriptPath();
      const workingDir = this.pathManager.getPythonDirectory();

      console.log(`Starting Python process: ${pythonExecutable} ${mainScript}`);
      console.log(`Working directory: ${workingDir}`);

      // Prepare environment variables
      const env = {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: workingDir
      };

      // Add transcript directory to environment
      env.TRANSCRIPT_DIR = this.pathManager.getTranscriptDirectory();

      this.pythonProcess = spawn(pythonExecutable, [mainScript], {
        cwd: workingDir,
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.processStartTime = Date.now();

      // Setup process event handlers
      this.setupProcessHandlers();

      // Wait for process to start properly
      await this.waitForProcessReady();

      this.isRunning = true;
      this.restartAttempts = 0;
      this.emit('processStarted', {
        pid: this.pythonProcess.pid,
        startTime: this.processStartTime
      });
      
      console.log(`Python transcription process started successfully (PID: ${this.pythonProcess.pid})`);
      return true;
    } catch (error) {
      console.error('Failed to start Python process:', error);
      this.emit('processError', error);
      throw error;
    }
  }

  /**
   * Setup event handlers for the Python process
   */
  setupProcessHandlers() {
    if (!this.pythonProcess) return;

    this.pythonProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[Python] ${output}`);
        this.emit('processOutput', output);
        
        // Check for ready indicators
        if (output.includes('READY - Ecoute is now running') || 
            output.includes('Starting transcription...')) {
          this.emit('processReady');
        }
      }
    });

    this.pythonProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        // Filter out common non-critical warnings
        if (this.isNonCriticalError(error)) {
          console.warn(`[Python Warning] ${error}`);
        } else {
          console.error(`[Python Error] ${error}`);
          this.emit('processError', new Error(error));
        }
      }
    });

    this.pythonProcess.on('close', (code, signal) => {
      console.log(`Python process closed with code ${code}, signal ${signal}`);
      this.isRunning = false;
      this.pythonProcess = null;
      
      const eventData = { 
        code, 
        signal, 
        uptime: this.processStartTime ? Date.now() - this.processStartTime : 0 
      };
      
      this.emit('processStopped', eventData);
      
      // Auto-restart if it was an unexpected termination
      if (code !== 0 && signal !== 'SIGTERM' && this.restartAttempts < this.maxRestartAttempts) {
        console.log(`Process crashed unexpectedly, attempting restart (${this.restartAttempts + 1}/${this.maxRestartAttempts})`);
        this.restartAttempts++;
        setTimeout(() => this.start().catch(console.error), 2000);
      }
    });

    this.pythonProcess.on('error', (error) => {
      console.error('Python process error:', error);
      this.isRunning = false;
      this.emit('processError', error);
    });
  }

  /**
   * Check if error message is non-critical
   */
  isNonCriticalError(errorMessage) {
    const nonCriticalPatterns = [
      'ALSA lib',
      'PulseAudio server connection failure',
      'jack server is not running',
      'UserWarning: FP16 is not supported on CPU',
      'deprecation warning'
    ];
    
    return nonCriticalPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Wait for the Python process to be ready
   */
  async waitForProcessReady(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let readyReceived = false;
      
      // Listen for ready event
      const onReady = () => {
        readyReceived = true;
        this.removeListener('processReady', onReady);
        resolve(true);
      };
      
      this.on('processReady', onReady);
      
      const checkReady = () => {
        if (readyReceived) return;
        
        if (Date.now() - startTime > timeout) {
          this.removeListener('processReady', onReady);
          reject(new Error('Python process failed to start within timeout'));
          return;
        }

        // Alternative check: look for transcript directory creation
        const transcriptsDir = this.pathManager.getTranscriptDirectory();
        if (fs.existsSync(transcriptsDir)) {
          // Check if any transcript files were created recently
          try {
            const files = fs.readdirSync(transcriptsDir);
            const recentFiles = files.filter(file => {
              const filePath = path.join(transcriptsDir, file);
              const stats = fs.statSync(filePath);
              return Date.now() - stats.mtime.getTime() < 10000; // Created within last 10 seconds
            });
            
            if (recentFiles.length > 0) {
              console.log('Process appears ready based on transcript file creation');
              this.removeListener('processReady', onReady);
              resolve(true);
              return;
            }
          } catch (error) {
            // Ignore errors checking files
          }
        }

        setTimeout(checkReady, 1000);
      };

      // Start checking after a small delay
      setTimeout(checkReady, 2000);
    });
  }

  /**
   * Stop the Python transcription process
   */
  async stop() {
    if (!this.isRunning || !this.pythonProcess) {
      console.log('Python process not running');
      return;
    }

    try {
      console.log('Stopping Python transcription process...');
      
      // Try graceful shutdown first
      this.pythonProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (this.pythonProcess && !this.pythonProcess.killed) {
            console.log('Graceful shutdown timed out, forcing termination');
            this.pythonProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
        
        if (this.pythonProcess) {
          this.pythonProcess.on('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      this.isRunning = false;
      this.pythonProcess = null;
      this.processStartTime = null;
      
      console.log('Python process stopped successfully');
    } catch (error) {
      console.error('Error stopping Python process:', error);
      throw error;
    }
  }

  /**
   * Send a signal to the Python process (for mic enable/disable)
   */
  setMicEnabled(enabled) {
    // For now, the Python process handles mic state internally
    // In the future, we could extend this to send signals to the Python process
    console.log(`Microphone ${enabled ? 'enabled' : 'disabled'}`);
    
    // We could implement this by:
    // 1. Writing to a status file that Python monitors
    // 2. Sending signals to the process
    // 3. Using stdin to send commands
    
    try {
      const statusFile = path.join(this.pathManager.getPythonDirectory(), 'mic_status.json');
      const status = {
        enabled: enabled,
        timestamp: Date.now()
      };
      
      fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
      console.log(`Mic status written to ${statusFile}`);
      return true;
    } catch (error) {
      console.error('Error setting mic status:', error);
      return false;
    }
  }

  /**
   * Get process information
   */
  getProcessInfo() {
    return {
      running: this.isRunning,
      pid: this.pythonProcess?.pid || null,
      killed: this.pythonProcess?.killed || false,
      startTime: this.processStartTime,
      uptime: this.processStartTime ? Date.now() - this.processStartTime : 0,
      restartAttempts: this.restartAttempts
    };
  }

  /**
   * Restart the Python process
   */
  async restart() {
    console.log('Restarting Python transcription process...');
    
    if (this.isRunning) {
      await this.stop();
    }
    
    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return await this.start();
  }
}

module.exports = AudioSystemManager; 