/**
 * Helper script to install Python dependencies for audio transcription
 * This runs at startup to ensure all required packages are available
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Get absolute path to this directory, handling spaces in path
const CURRENT_DIR = __dirname;
const REQUIREMENTS_FILE = path.join(CURRENT_DIR, 'requirements.txt');

/**
 * Check if Python is installed and get its version
 * @returns {Promise<boolean>} True if Python is installed
 */
async function checkPython() {
  try {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const result = execSync(`${pythonCmd} --version`, { encoding: 'utf8' });
    console.log(`Python version: ${result.trim()}`);
    return true;
  } catch (error) {
    console.error('Python not found:', error.message);
    return false;
  }
}

/**
 * Check if pip is installed
 * @returns {Promise<boolean>} True if pip is installed
 */
async function checkPip() {
  try {
    const pipCmd = process.platform === 'win32' ? 'pip' : 'pip3';
    const result = execSync(`${pipCmd} --version`, { encoding: 'utf8' });
    console.log(`Pip version: ${result.trim()}`);
    return true;
  } catch (error) {
    console.error('Pip not found:', error.message);
    return false;
  }
}

/**
 * Install required packages using pip
 * @returns {Promise<boolean>} True if installation successful
 */
async function installDependencies() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(REQUIREMENTS_FILE)) {
      console.error(`Requirements file not found: ${REQUIREMENTS_FILE}`);
      return resolve(false);
    }
    
    console.log(`Installing dependencies from ${REQUIREMENTS_FILE}...`);
    
    const pipCmd = process.platform === 'win32' ? 'pip' : 'pip3';
    const pipArgs = ['install', '-r', REQUIREMENTS_FILE];
    
    // Add --user flag if not running as administrator (on Windows only)
    if (process.platform === 'win32' && !isRunningAsAdmin()) {
      pipArgs.push('--user');
    }
    
    console.log(`Running: ${pipCmd} ${pipArgs.join(' ')}`);
    
    const pythonProcess = spawn(pipCmd, pipArgs, {
      cwd: CURRENT_DIR,
      shell: true,
      stdio: 'pipe' // Capture output
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(output);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(output);
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Dependencies installed successfully');
        resolve(true);
      } else {
        console.error(`Dependencies installation failed with code ${code}`);
        console.error(stderr);
        resolve(false);
      }
    });
    
    pythonProcess.on('error', (err) => {
      console.error('Dependencies installation error:', err);
      resolve(false);
    });
  });
}

/**
 * Check if running as administrator on Windows
 * @returns {boolean} True if running as admin
 */
function isRunningAsAdmin() {
  if (process.platform !== 'win32') {
    return false;
  }
  
  try {
    // This command will succeed if running as admin and fail otherwise
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Main function to run all checks and installations
 */
async function main() {
  try {
    console.log('Checking Python and dependencies...');
    
    const pythonInstalled = await checkPython();
    if (!pythonInstalled) {
      console.error('Python is not installed or not in PATH');
      return false;
    }
    
    const pipInstalled = await checkPip();
    if (!pipInstalled) {
      console.error('Pip is not installed or not in PATH');
      return false;
    }
    
    // Install dependencies
    const installed = await installDependencies();
    return installed;
  } catch (error) {
    console.error('Error checking dependencies:', error);
    return false;
  }
}

// Export functions for use in other modules
module.exports = {
  checkDependencies: main,
  installDependencies,
  CURRENT_DIR
};

// Run main function if called directly
if (require.main === module) {
  main().then((success) => {
    console.log(`Dependencies check ${success ? 'successful' : 'failed'}`);
    process.exit(success ? 0 : 1);
  });
} 