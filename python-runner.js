/**
 * Python Runner - Properly handles Python script execution
 * Resolves issues with paths containing spaces and ensures proper Python initialization
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = console; // Can be replaced with a proper logger in production

const SCRIPT_DIR = __dirname;

/**
 * Get the best Python executable for the current environment
 * @returns {string} Path to Python executable
 */
function getPythonExecutable() {
  // Try to use a bundled Python if available
  const bundledPythonPaths = [
    path.join(process.resourcesPath, 'python', 'python.exe'),  // Windows bundled
    path.join(process.resourcesPath, 'python', 'bin', 'python'),  // Mac/Linux bundled
    path.join(app.getAppPath(), 'python', 'python.exe'),  // Alternative Windows location
  ];

  for (const pythonPath of bundledPythonPaths) {
    if (fs.existsSync(pythonPath)) {
      logger.log(`Using bundled Python at: ${pythonPath}`);
      return pythonPath;
    }
  }

  // Fall back to system Python
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Run a Python script with proper path handling
 * @param {string} scriptName - Name of the script file (relative to audio-transcription-module)
 * @param {Array<string>} args - Additional arguments to pass to the script
 * @param {object} options - Additional options for spawn
 * @returns {ChildProcess} The spawned Python process
 */
function runPythonScript(scriptName, args = [], options = {}) {
  try {
    // Get the Python executable
    const pythonExe = getPythonExecutable();
    
    // Find the script path
    const scriptPath = path.join(SCRIPT_DIR, scriptName);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python script not found: ${scriptPath}`);
    }
    
    // Prepare full arguments array with script path as first argument
    const fullArgs = [scriptPath, ...args];
    
    // Default options
    const defaultOptions = {
      cwd: SCRIPT_DIR,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      shell: true, // Use shell to handle spaces in paths
    };
    
    // Merge default options with provided options
    const spawnOptions = { ...defaultOptions, ...options };
    
    // Log the command
    logger.log(`Running Python script: ${pythonExe} ${fullArgs.join(' ')}`);
    logger.log(`Working directory: ${spawnOptions.cwd}`);
    
    // Start the process
    const pythonProcess = spawn(pythonExe, fullArgs, spawnOptions);
    
    // Set up default logging for process output
    if (!options.stdio || options.stdio === 'pipe') {
      pythonProcess.stdout.on('data', (data) => {
        logger.log(`[Python] ${data.toString().trim()}`);
      });
      
      pythonProcess.stderr.on('data', (data) => {
        logger.error(`[Python Error] ${data.toString().trim()}`);
      });
    }
    
    // Log process events
    pythonProcess.on('error', (error) => {
      logger.error(`Failed to start Python process: ${error.message}`);
    });
    
    pythonProcess.on('close', (code) => {
      logger.log(`Python process exited with code ${code}`);
    });
    
    return pythonProcess;
  } catch (error) {
    logger.error(`Error running Python script: ${error.message}`);
    throw error;
  }
}

/**
 * Check if Python is installed and available
 * @returns {Promise<boolean>} True if Python is available
 */
async function checkPythonAvailable() {
  try {
    const pythonExe = getPythonExecutable();
    
    // Try running Python with --version flag
    const result = execSync(`"${pythonExe}" --version`, { encoding: 'utf8', shell: true });
    logger.log(`Python check successful: ${result.trim()}`);
    return true;
  } catch (error) {
    logger.error(`Python check failed: ${error.message}`);
    return false;
  }
}

// Export functions
module.exports = {
  runPythonScript,
  checkPythonAvailable,
  getPythonExecutable,
}; 