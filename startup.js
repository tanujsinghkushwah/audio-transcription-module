/**
 * Startup script for audio transcription module
 * Handles Python dependency installation and initialization
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const pythonRunner = require('./python-runner');
const dependencyInstaller = require('./install-dependencies');

// Configure logger
const logger = console;

/**
 * Initialize the audio transcription module
 * @returns {Promise<boolean>} True if initialization successful
 */
async function initialize() {
  try {
    logger.log('[AudioTranscription] Initializing audio transcription module...');
    
    // Check if audio dependency checks are enabled
    const checksEnabled = process.env.AUDIO_DEPENDENCY_CHECKS_ENABLED !== 'false';
    
    if (!checksEnabled) {
      logger.log('[AudioTranscription] Audio dependency checks disabled, skipping Python and dependency verification for faster startup');
      logger.log('[AudioTranscription] Initialization complete.');
      return true;
    }
    
    // Check if Python is available
    const pythonAvailable = await pythonRunner.checkPythonAvailable();
    if (!pythonAvailable) {
      logger.error('[AudioTranscription] Python is not available. Audio transcription will not work.');
      // Continue anyway - we'll handle the error gracefully later
    } else {
      logger.log('[AudioTranscription] Python is available.');
    }
    
    // Check if the transcripts directory exists, create it if not
    const transcriptsDir = path.join(__dirname, 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      logger.log(`[AudioTranscription] Creating transcripts directory: ${transcriptsDir}`);
      try {
        fs.mkdirSync(transcriptsDir, { recursive: true });
      } catch (error) {
        logger.error('[AudioTranscription] Error creating transcripts directory:', error);
      }
    }
    
    // Check and install dependencies
    logger.log('[AudioTranscription] Checking and installing Python dependencies...');
    const dependenciesResult = await dependencyInstaller.checkDependencies();
    if (!dependenciesResult) {
      logger.warn('[AudioTranscription] Some dependencies may be missing. Will try to install them at runtime.');
    } else {
      logger.log('[AudioTranscription] Python dependencies are installed.');
    }
    
    logger.log('[AudioTranscription] Initialization complete.');
    return true;
  } catch (error) {
    logger.error('[AudioTranscription] Error initializing audio transcription module:', error);
    return false;
  }
}

/**
 * Start the audio transcription process
 * @returns {Promise<object>} Python process and status
 */
async function start() {
  try {
    logger.log('[AudioTranscription] Starting audio transcription...');
    
    // Check if python-runner exists and is accessible
    const pythonRunnerPath = path.join(__dirname, 'python-runner.js');
    if (!fs.existsSync(pythonRunnerPath)) {
      throw new Error('python-runner.js not found');
    }
    
    // Check if main.py exists and is accessible
    const mainPyPath = path.join(__dirname, 'main.py');
    if (!fs.existsSync(mainPyPath)) {
      throw new Error('main.py not found');
    }
    
    // Run the main.py script with pythonRunner
    const process = pythonRunner.runPythonScript('main.py', [], {
      detached: false, // Keep tied to parent process
      stdio: ['pipe', 'pipe', 'pipe'] // Capture all output
    });
    
    if (!process || !process.pid) {
      throw new Error('Failed to start Python process');
    }
    
    logger.log(`[AudioTranscription] Python process started with PID: ${process.pid}`);
    
    // Set up enhanced output capture
    let stdoutBuffer = '';
    let stderrBuffer = '';
    
    process.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutBuffer += output;
      logger.log(`[AudioTranscription] Python stdout: ${output.trim()}`);
    });
    
    process.stderr.on('data', (data) => {
      const error = data.toString();
      stderrBuffer += error;
      logger.log(`[AudioTranscription] Python stderr: ${error.trim()}`);
      
      // Check for permission errors
      if (error.includes('PaMacCore') || error.includes('err=\'-50\'')) {
        logger.log('[AudioTranscription] ❌ DETECTED: macOS microphone permission error');
        logger.log('[AudioTranscription] 💡 SOLUTION: Grant microphone permissions in System Preferences');
      }
    });
    
    process.on('close', (code, signal) => {
      logger.log(`[AudioTranscription] Process closed with code: ${code}, signal: ${signal}`);
      if (code !== 0) {
        logger.log('[AudioTranscription] ❌ Process exited with error');
        if (stderrBuffer) {
          logger.log(`[AudioTranscription] Error output: ${stderrBuffer.trim()}`);
        }
      }
    });
    
    process.on('error', (error) => {
      logger.log(`[AudioTranscription] Process error: ${error.message}`);
    });
    
    return {
      success: true,
      process,
      stdoutBuffer: () => stdoutBuffer,
      stderrBuffer: () => stderrBuffer
    };
  } catch (error) {
    logger.error('[AudioTranscription] Error starting audio transcription:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Stop the audio transcription process
 * @param {object} process - The Python process to stop
 * @returns {Promise<boolean>} True if stop successful
 */
async function stop(process) {
  try {
    logger.log('[AudioTranscription] Stopping audio transcription...');
    
    if (!process) {
      logger.log('[AudioTranscription] No process to stop.');
      return true;
    }
    
    // Try to send SIGINT first, then SIGKILL if needed
    if (process.pid) {
      logger.log(`[AudioTranscription] Sending signal to process PID ${process.pid}`);
      
      try {
        process.kill('SIGINT');
        
        // Give it a second to shut down gracefully
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if it's still running
        const stillRunning = process.exitCode === null && !process.killed;
        if (stillRunning) {
          logger.log('[AudioTranscription] Process still running, sending SIGKILL');
          process.kill('SIGKILL');
        }
      } catch (error) {
        logger.error('[AudioTranscription] Error killing process:', error);
      }
    }
    
    logger.log('[AudioTranscription] Stop complete.');
    return true;
  } catch (error) {
    logger.error('[AudioTranscription] Error stopping audio transcription:', error);
    return false;
  }
}

// Export functions
module.exports = {
  initialize,
  start,
  stop
}; 