/**
 * Node.js wrapper for the Python audio transcription module
 * This provides a simple interface to use the Python module from Node.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AudioTranscriptionWrapper {
  constructor() {
    this.pythonProcess = null;
    this.transcriptFile = null;
    this.isRunning = false;
    this.onTranscriptCallback = null;
    this.watchInterval = null;
    this.lastLineCount = 0;
    this.answeredQuestions = new Set();
    this.SILENCE_THRESHOLD = 300; // 300ms is very aggressive for fast response
    this.lastActivityTime = null;
  }

  /**
   * Initialize the audio transcription module
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize() {
    try {
      console.log('Initializing audio transcription module');
      
      // Check if Python is installed
      await this._checkPythonInstalled();
      
      // Check if required packages are installed
      await this._checkRequiredPackages();
      
      console.log('Audio transcription module initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing audio transcription module:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Start audio transcription
   * @returns {Promise<boolean>} True if start successful
   */
  async start() {
    try {
      if (this.isRunning) {
        console.log('Audio transcription already running');
        return true;
      }

      console.log('Starting audio transcription');
      
      // Start the Python process
      const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = path.join(__dirname, 'ecoute.py');  // Changed from main.py to ecoute.py
      
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Python script not found at ${scriptPath}`);
      }

      // Create transcripts directory if it doesn't exist
      const transcriptsDir = path.join(__dirname, 'transcripts');
      if (!fs.existsSync(transcriptsDir)) {
        fs.mkdirSync(transcriptsDir, { recursive: true });
      }
      
      this.pythonProcess = spawn(pythonExecutable, [scriptPath], {
        cwd: __dirname,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        shell: true
      });

      // Handle stdout
      this.pythonProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log('Python output:', output);
          
          // Check if the output contains the transcript file path
          const match = output.match(/Saving transcript to: (.+\.txt)/);
          if (match && match[1]) {
            const relativePath = match[1].trim();
            this.transcriptFile = path.join(__dirname, relativePath);
            console.log('Transcript file path detected:', this.transcriptFile);
            
            // Start watching the transcript file
            this._startWatchingTranscriptFile();
          }
        }
      });

      // Handle stderr
      this.pythonProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          console.error('Python error:', error);
        }
      });

      // Handle process exit
      this.pythonProcess.on('exit', (code, signal) => {
        console.log('Python process exited with code:', code, 'signal:', signal);
        this.pythonProcess = null;
        this.isRunning = false;
        
        // Stop watching the transcript file
        this._stopWatchingTranscriptFile();
      });

      // Handle process error
      this.pythonProcess.on('error', (error) => {
        console.error('Python process error:', error);
        this.pythonProcess = null;
        this.isRunning = false;
      });

      this.isRunning = true;
      console.log('Audio transcription started successfully');
      
      return true;
    } catch (error) {
      console.error('Error starting audio transcription:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Stop audio transcription
   * @returns {Promise<boolean>} True if stop successful
   */
  async stop() {
    try {
      if (!this.isRunning) {
        console.log('Audio transcription not running');
        return true;
      }

      console.log('Stopping audio transcription');
      
      // Stop watching the transcript file
      this._stopWatchingTranscriptFile();
      
      // Kill the Python process
      if (this.pythonProcess) {
        // Try to send a graceful stop signal (SIGINT) first
        if (process.platform === 'win32') {
          // On Windows, we need to use taskkill
          spawn('taskkill', ['/pid', this.pythonProcess.pid, '/f', '/t']);
        } else {
          // On Unix-like systems
          this.pythonProcess.kill('SIGINT');
        }
        
        this.pythonProcess = null;
      }
      
      this.isRunning = false;
      console.log('Audio transcription stopped successfully');
      
      return true;
    } catch (error) {
      console.error('Error stopping audio transcription:', error);
      return false;
    }
  }

  /**
   * Set callback for transcript updates
   * @param {Function} callback - Callback function that receives transcript text
   */
  setTranscriptCallback(callback) {
    this.onTranscriptCallback = callback;
  }

  /**
   * Get the current transcript file path
   * @returns {string|null} Transcript file path or null if not available
   */
  getTranscriptFilePath() {
    return this.transcriptFile;
  }

  /**
   * Check if Python is installed
   * @private
   */
  async _checkPythonInstalled() {
    return new Promise((resolve, reject) => {
      const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
      const pythonProcess = spawn(pythonExecutable, ['--version']);
      
      pythonProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Python is not installed or not in PATH'));
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`Python check error: ${error.message}`));
      });
    });
  }

  /**
   * Check if required Python packages are installed
   * @private
   */
  async _checkRequiredPackages() {
    return new Promise((resolve, reject) => {
      const requirementsPath = path.join(__dirname, 'requirements.txt');
      
      if (!fs.existsSync(requirementsPath)) {
        reject(new Error('requirements.txt not found'));
        return;
      }
      
      const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
      const checkScript = `
import sys
import pkg_resources
import importlib

required = []
with open('${requirementsPath.replace(/\\/g, '\\\\')}', 'r') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#'):
            required.append(line)

missing = []
for package in required:
    try:
        pkg_name = package.split('==')[0].split('>')[0].split('<')[0].split('~=')[0].strip()
        if pkg_name == '--extra-index-url':
            continue
        importlib.import_module(pkg_name)
    except ImportError:
        missing.append(package)

if missing:
    print(f"Missing required packages: Missing packages: {', '.join(missing)}")
    sys.exit(1)
else:
    print("All required packages are installed")
    sys.exit(0)
`;
      
      const checkScriptPath = path.join(__dirname, '_check_packages.py');
      fs.writeFileSync(checkScriptPath, checkScript);
      
      const pythonProcess = spawn(pythonExecutable, [checkScriptPath], {
        cwd: __dirname
      });
      
      let output = '';
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      let errorOutput = '';
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('exit', (code) => {
        // Clean up the temporary script
        try {
          fs.unlinkSync(checkScriptPath);
        } catch (error) {
          console.warn('Failed to delete temporary script:', error);
        }
        
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${output || errorOutput}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`Package check error: ${error.message}`));
      });
    });
  }

  /**
   * Start watching the transcript file for changes
   * @private
   */
  _startWatchingTranscriptFile() {
    if (!this.transcriptFile) {
      console.warn('No transcript file to watch');
      return;
    }

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
    }

    this.lastLineCount = 0;
    this.lastActivityTime = Date.now();
    
    this.watchInterval = setInterval(() => {
      try {
        if (!fs.existsSync(this.transcriptFile)) {
          return;
        }

        const content = fs.readFileSync(this.transcriptFile, 'utf8');
        const lines = content.split('\n');
        
        if (lines.length > this.lastLineCount) {
          // Process new lines
          const newLines = lines.slice(this.lastLineCount);
          this.lastLineCount = lines.length;
          
          // Extract Speaker lines specifically
          const speakerLines = newLines.filter(line => line.includes('Speaker['));
          
          if (speakerLines.length > 0) {
            // Process each speaker line
            this._processNewSpeakerLines(speakerLines);
            
            // Also send the raw content to any transcript line callback
            if (this.onTranscriptCallback) {
              this.onTranscriptCallback(content);
            }
          }
        }
      } catch (error) {
        console.error('Error watching transcript file:', error);
      }
    }, 300);

    console.log('Started watching transcript file');
  }

  /**
   * Process new speaker lines and detect questions
   * @param {string[]} speakerLines - Lines containing Speaker tags
   * @private
   */
  _processNewSpeakerLines(speakerLines) {
    try {
      // Update last activity time
      this.lastActivityTime = Date.now();
      
      // Get the most recent line (typically the one we want to process)
      const latestLine = speakerLines[speakerLines.length - 1];
      
      // Extract timestamp and text
      const match = latestLine.match(/Speaker\[([^\]]+)\]:\s*\[(.*)\]/);
      if (match && match.length >= 3) {
        const timestamp = match[1];
        const text = match[2].trim();
        
        if (text && text.length > 0) {
          // Generate a unique key for this question to avoid duplicates
          const questionKey = `${timestamp}:${text}`;
          
          if (!this.answeredQuestions.has(questionKey)) {
            // Check if this looks like a question
            const isProbablyQuestion = this._isLikelyQuestion(text);
            
            console.log(`Detected speech: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''} (Question: ${isProbablyQuestion})`);
            
            if (isProbablyQuestion) {
              // Mark as answered to avoid duplicates
              this.answeredQuestions.add(questionKey);
              
              // If the set gets too large, clear oldest entries
              if (this.answeredQuestions.size > 50) {
                const questionArray = Array.from(this.answeredQuestions);
                this.answeredQuestions = new Set(questionArray.slice(-30));
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing speaker lines:', error);
    }
  }
  
  /**
   * Check if text is likely a question based on various heuristics
   * @param {string} text - The text to check
   * @returns {boolean} - Whether the text is likely a question
   * @private
   */
  _isLikelyQuestion(text) {
    if (!text) return false;
    
    const lowerText = text.toLowerCase();
    
    // Explicit question indicators
    if (lowerText.endsWith('?')) return true;
    
    // Common question starters
    const questionStarters = [
      'what', 'how', 'why', 'when', 'where', 'which', 'who', 'whose', 'whom',
      'can', 'could', 'will', 'would', 'do', 'does', 'is', 'are', 'explain',
      'tell me', 'describe', 'show me', 'compare'
    ];
    
    for (const starter of questionStarters) {
      if (lowerText.startsWith(starter)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Stop watching the transcript file
   * @private
   */
  _stopWatchingTranscriptFile() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
      console.log('Stopped watching transcript file');
    }
  }
}

module.exports = new AudioTranscriptionWrapper(); 