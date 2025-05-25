/**
 * Enhanced Startup Module for Interview Genie Audio Transcription
 * Coordinates initialization of the cross-platform audio system
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class EnhancedAudioStartup {
  constructor() {
    this.pythonProcess = null;
    this.isRunning = false;
    this.platform = os.platform();
    this.audioBackend = null;
    this.statusFile = path.join(__dirname, 'startup_status.json');
  }

  /**
   * Initialize the enhanced audio system
   */
  async initialize() {
    console.log('🚀 Enhanced Audio Startup: Initializing...');
    
    try {
      // Step 1: Check if enhanced files exist
      const requiredFiles = [
        'audio_compatibility.py',
        'main_enhanced.py'
      ];
      
      const missingFiles = requiredFiles.filter(file => 
        !fs.existsSync(path.join(__dirname, file))
      );
      
      if (missingFiles.length > 0) {
        console.log(`⚠️  Missing enhanced files: ${missingFiles.join(', ')}`);
        console.log('📦 Falling back to standard initialization');
        return this.initializeFallback();
      }
      
      // Step 2: Run compatibility check
      console.log('🧪 Running audio compatibility check...');
      const compatResult = await this.runCompatibilityCheck();
      
      if (!compatResult.success) {
        console.log('❌ Compatibility check failed, using fallback');
        return this.initializeFallback();
      }
      
      // Step 3: Platform-specific setup
      if (this.platform === 'darwin') {
        const macOSSetup = await this.setupMacOS();
        if (!macOSSetup) {
          console.log('⚠️  macOS setup had issues, continuing...');
        }
      }
      
      // Step 4: Create status file
      await this.createStatusFile({
        initialized: true,
        backend: compatResult.backend,
        platform: this.platform,
        enhanced: true
      });
      
      console.log('✅ Enhanced audio system initialized successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Enhanced initialization failed:', error.message);
      return this.initializeFallback();
    }
  }

  /**
   * Run audio compatibility check
   */
  async runCompatibilityCheck() {
    try {
      const pythonCmd = this.platform === 'win32' ? 'python' : 'python3';
      const compatScript = path.join(__dirname, 'audio_compatibility.py');
      
      return new Promise((resolve) => {
        const process = spawn(pythonCmd, [compatScript], {
          cwd: __dirname,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            // Try to parse backend info from stdout
            let backend = 'unknown';
            if (stdout.includes('SoundDevice')) backend = 'SoundDevice';
            else if (stdout.includes('PyAudioWPatch')) backend = 'PyAudioWPatch';
            else if (stdout.includes('PyAudio')) backend = 'PyAudio';
            
            resolve({
              success: true,
              backend,
              output: stdout.trim()
            });
          } else {
            resolve({
              success: false,
              error: stderr.trim() || stdout.trim(),
              code
            });
          }
        });
        
        process.on('error', (error) => {
          resolve({
            success: false,
            error: error.message
          });
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
          process.kill();
          resolve({
            success: false,
            error: 'Compatibility check timed out'
          });
        }, 30000);
      });
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Setup macOS-specific audio handling
   */
  async setupMacOS() {
    try {
      console.log('🍎 Setting up macOS audio environment...');
      
      const installerScript = path.join(__dirname, 'macos_audio_installer.py');
      
      if (!fs.existsSync(installerScript)) {
        console.log('⚠️  macOS installer not found, skipping');
        return true;
      }
      
      const pythonCmd = 'python3';
      
      return new Promise((resolve) => {
        const process = spawn(pythonCmd, [installerScript], {
          cwd: __dirname,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        
        process.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          console.log('🔧 macOS setup:', text.trim());
        });
        
        process.stderr.on('data', (data) => {
          const text = data.toString();
          output += text;
          console.log('⚠️  macOS setup warning:', text.trim());
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            console.log('✅ macOS audio setup completed');
            resolve(true);
          } else {
            console.log(`⚠️  macOS setup exited with code ${code}`);
            resolve(false);
          }
        });
        
        process.on('error', (error) => {
          console.log('❌ macOS setup error:', error.message);
          resolve(false);
        });
        
        // Timeout after 5 minutes
        setTimeout(() => {
          process.kill();
          console.log('⏰ macOS setup timed out');
          resolve(false);
        }, 300000);
      });
      
    } catch (error) {
      console.log('❌ macOS setup error:', error.message);
      return false;
    }
  }

  /**
   * Start the enhanced audio transcription
   */
  async start() {
    try {
      if (this.isRunning) {
        console.log('⚠️  Audio transcription already running');
        return { success: true, message: 'Already running' };
      }
      
      console.log('🎧 Starting enhanced audio transcription...');
      
      // Choose the right main script
      let mainScript = 'main.py';
      const enhancedScript = path.join(__dirname, 'main_enhanced.py');
      
      if (fs.existsSync(enhancedScript)) {
        mainScript = 'main_enhanced.py';
        console.log('✅ Using enhanced main script');
      } else {
        console.log('⚠️  Enhanced script not found, using fallback');
      }
      
      const pythonCmd = this.platform === 'win32' ? 'python' : 'python3';
      
      this.pythonProcess = spawn(pythonCmd, [mainScript], {
        cwd: __dirname,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          ENHANCED_STARTUP_COMPLETED: 'true'
        },
        shell: this.platform === 'win32'
      });
      
      // Set up event handlers
      this.pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Enhanced Audio]', output.trim());
      });
      
      this.pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error('[Enhanced Audio Error]', output.trim());
        
        // Detect specific errors
        if (output.includes('PaMacCore') || output.includes('symbol not found')) {
          console.error('🚨 macOS audio permission/compatibility issue detected');
        }
      });
      
      this.pythonProcess.on('close', (code) => {
        console.log(`Enhanced audio process exited with code ${code}`);
        this.isRunning = false;
        this.pythonProcess = null;
      });
      
      this.pythonProcess.on('error', (error) => {
        console.error('Enhanced audio process error:', error.message);
        this.isRunning = false;
        this.pythonProcess = null;
      });
      
      this.isRunning = true;
      
      // Update status
      await this.createStatusFile({
        running: true,
        script: mainScript,
        pid: this.pythonProcess.pid,
        startTime: new Date().toISOString()
      });
      
      console.log('✅ Enhanced audio transcription started');
      
      return {
        success: true,
        process: this.pythonProcess,
        script: mainScript
      };
      
    } catch (error) {
      console.error('❌ Failed to start enhanced audio transcription:', error.message);
      this.isRunning = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop the enhanced audio transcription
   */
  async stop() {
    try {
      if (!this.isRunning || !this.pythonProcess) {
        console.log('⚠️  Audio transcription not running');
        return { success: true };
      }
      
      console.log('🛑 Stopping enhanced audio transcription...');
      
      // Try graceful shutdown first
      this.pythonProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.pythonProcess && !this.pythonProcess.killed) {
          console.log('💥 Force killing audio process...');
          this.pythonProcess.kill('SIGKILL');
        }
      }, 5000);
      
      this.isRunning = false;
      this.pythonProcess = null;
      
      // Update status
      await this.createStatusFile({
        running: false,
        stopTime: new Date().toISOString()
      });
      
      console.log('✅ Enhanced audio transcription stopped');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error stopping enhanced audio transcription:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fallback initialization for when enhanced system is not available
   */
  async initializeFallback() {
    console.log('🔄 Using fallback initialization...');
    
    try {
      await this.createStatusFile({
        initialized: true,
        enhanced: false,
        platform: this.platform,
        fallback: true
      });
      
      return true;
    } catch (error) {
      console.error('❌ Fallback initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Create status file with current state
   */
  async createStatusFile(status) {
    try {
      const fullStatus = {
        ...status,
        timestamp: new Date().toISOString(),
        platform: this.platform,
        version: '1.0.0'
      };
      
      fs.writeFileSync(this.statusFile, JSON.stringify(fullStatus, null, 2));
    } catch (error) {
      console.warn('⚠️  Could not create status file:', error.message);
    }
  }
}

// Export instance and functions
const audioStartup = new EnhancedAudioStartup();

module.exports = {
  initialize: () => audioStartup.initialize(),
  start: () => audioStartup.start(),
  stop: () => audioStartup.stop(),
  instance: audioStartup
}; 