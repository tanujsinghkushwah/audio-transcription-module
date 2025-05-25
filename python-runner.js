/**
 * Python Runner - Properly handles Python script execution
 * Resolves issues with paths containing spaces and ensures proper Python initialization
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Handle electron app import gracefully - it may not be available in all contexts
let app = null;
try {
  const electron = require('electron');
  app = electron.app || (electron.remote && electron.remote.app);
} catch (error) {
  // Running outside of electron context, app will remain null
}

const logger = console; // Can be replaced with a proper logger in production

const SCRIPT_DIR = __dirname;

/**
 * Get the best Python executable for the current environment
 * @returns {string} Path to Python executable
 */
function getPythonExecutable() {
  // Try to use a bundled Python if available, but only if app is available
  if (app) {
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
  }

  // For macOS and Linux, prefer python3
  if (process.platform !== 'win32') {
    try {
      // Check if python3 is available
      const { execSync } = require('child_process');
      execSync('which python3', { stdio: 'ignore' });
      return 'python3';
    } catch (error) {
      // Fall back to python if python3 not found
      logger.log('python3 not found, falling back to python');
    }
  }

  // Fall back to system Python
  return process.platform === 'win32' ? 'python' : 'python';
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
    
    // Default options - different handling for different platforms
    let defaultOptions;
    
    if (process.platform === 'win32') {
      // Windows: use shell to handle spaces
      defaultOptions = {
        cwd: SCRIPT_DIR,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
        shell: true,
      };
    } else {
      // macOS/Linux: don't use shell to avoid path parsing issues
      defaultOptions = {
        cwd: SCRIPT_DIR,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
        shell: false,
      };
    }
    
    // Merge default options with provided options
    const spawnOptions = { ...defaultOptions, ...options };
    
    // Log the command
    logger.log(`Running Python script: ${pythonExe} "${scriptPath}"`);
    logger.log(`Working directory: ${spawnOptions.cwd}`);
    logger.log(`Using shell: ${spawnOptions.shell}`);
    
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
      logger.error(`Command was: ${pythonExe} ${fullArgs.join(' ')}`);
      logger.error(`Working directory: ${spawnOptions.cwd}`);
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
    // Use different approaches for different platforms
    let result;
    if (process.platform === 'win32') {
      result = execSync(`"${pythonExe}" --version`, { encoding: 'utf8', shell: true });
    } else {
      // On macOS/Linux, don't use shell if pythonExe is a simple command
      if (pythonExe.includes('/') || pythonExe.includes(' ')) {
        // If it's a path (with slashes) or has spaces, use shell
        result = execSync(`"${pythonExe}" --version`, { encoding: 'utf8', shell: true });
      } else {
        // If it's just a command name, use execSync without shell
        result = execSync(`${pythonExe} --version`, { encoding: 'utf8', shell: false });
      }
    }
    
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