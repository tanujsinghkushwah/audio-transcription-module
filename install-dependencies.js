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
    const pythonCmds = ['python3', 'python'];
    let pythonFound = false;
    
    for (const pythonCmd of pythonCmds) {
      try {
        const result = execSync(`${pythonCmd} --version`, { 
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'ignore']
        });
        console.log(`[AudioDeps] Python version: ${result.trim()}`);
        pythonFound = true;
        break;
      } catch (cmdError) {
        // Try next command
        continue;
      }
    }
    
    if (!pythonFound) {
      console.error('[AudioDeps] Python not found with any common command');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[AudioDeps] Python not found:', error.message);
    return false;
  }
}

/**
 * Get the best Python executable
 * @returns {string} Python command to use
 */
function getPythonCommand() {
  const pythonCmds = ['python3', 'python'];
  
  for (const pythonCmd of pythonCmds) {
    try {
      execSync(`${pythonCmd} --version`, { 
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return pythonCmd;
    } catch (error) {
      continue;
    }
  }
  
  return 'python'; // Fallback
}

/**
 * Check if pip is available
 * @returns {Promise<boolean>} True if pip is available
 */
async function checkPip() {
  try {
    const pythonCmd = getPythonCommand();
    const result = execSync(`${pythonCmd} -m pip --version`, { 
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    console.log(`[AudioDeps] Pip version: ${result.trim()}`);
    return true;
  } catch (error) {
    console.error('[AudioDeps] Pip not available:', error.message);
    return false;
  }
}

/**
 * Install Python dependencies from requirements.txt
 * @returns {Promise<boolean>} True if installation successful
 */
async function installDependencies() {
  try {
    if (!fs.existsSync(REQUIREMENTS_FILE)) {
      console.error('[AudioDeps] Requirements file not found:', REQUIREMENTS_FILE);
      return false;
    }
    
    const pythonCmd = getPythonCommand();
    console.log('[AudioDeps] Installing Python dependencies...');
    
    // Use pip install with user flag to avoid permission issues
    // Quote the requirements file path to handle spaces
    const quotedRequirementsFile = process.platform === 'win32' ? `"${REQUIREMENTS_FILE}"` : `'${REQUIREMENTS_FILE}'`;
    const installCmd = `${pythonCmd} -m pip install --user --no-warn-script-location -r ${quotedRequirementsFile}`;
    
    console.log(`[AudioDeps] Running: ${installCmd}`);
    
    const result = execSync(installCmd, { 
      encoding: 'utf8',
      timeout: 120000, // 2 minutes timeout
      cwd: CURRENT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true // Use shell to handle quoted paths properly
    });
    
    console.log('[AudioDeps] Dependencies installed successfully');
    console.log('[AudioDeps] Install output:', result);
    return true;
  } catch (error) {
    console.error('[AudioDeps] Error installing dependencies:', error.message);
    if (error.stdout) {
      console.log('[AudioDeps] Install stdout:', error.stdout);
    }
    if (error.stderr) {
      console.error('[AudioDeps] Install stderr:', error.stderr);
    }
    return false;
  }
}

/**
 * Check if specific Python packages are installed
 * @param {Array<string>} packages - List of package names to check
 * @returns {Promise<object>} Object with package availability status
 */
async function checkPackages(packages = []) {
  try {
    const pythonCmd = getPythonCommand();
    const results = {};
    
    for (const pkg of packages) {
      try {
        execSync(`${pythonCmd} -c "import ${pkg}"`, { 
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'ignore']
        });
        results[pkg] = true;
        console.log(`[AudioDeps] Package ${pkg}: ✓ available`);
      } catch (error) {
        results[pkg] = false;
        console.log(`[AudioDeps] Package ${pkg}: ✗ missing`);
      }
    }
    
    return results;
  } catch (error) {
    console.error('[AudioDeps] Error checking packages:', error.message);
    return {};
  }
}

/**
 * Check all dependencies and install if needed
 * @returns {Promise<boolean>} True if all dependencies are available
 */
async function checkDependencies() {
  try {
    console.log('[AudioDeps] Checking Python environment...');
    
    // Check if Python is available
    const pythonAvailable = await checkPython();
    if (!pythonAvailable) {
      console.error('[AudioDeps] Python is not available. Please install Python 3.7+ to use audio features.');
      return false;
    }
    
    // Check if pip is available
    const pipAvailable = await checkPip();
    if (!pipAvailable) {
      console.error('[AudioDeps] Pip is not available. Please install pip to manage Python packages.');
      return false;
    }
    
    // Check critical packages
    const criticalPackages = ['numpy', 'torch', 'wave'];
    const packageStatus = await checkPackages(criticalPackages);
    
    const missingPackages = Object.entries(packageStatus)
      .filter(([pkg, available]) => !available)
      .map(([pkg, available]) => pkg);
    
    if (missingPackages.length > 0) {
      console.log(`[AudioDeps] Missing packages: ${missingPackages.join(', ')}`);
      
      // Try to install missing dependencies
      console.log('[AudioDeps] Attempting to install missing dependencies...');
      const installSuccess = await installDependencies();
      
      if (!installSuccess) {
        console.error('[AudioDeps] Failed to install dependencies automatically.');
        console.error('[AudioDeps] Please run: pip install -r requirements.txt manually in the audio-transcription-module directory.');
        return false;
      }
      
      // Re-check packages after installation
      const reCheckStatus = await checkPackages(criticalPackages);
      const stillMissing = Object.entries(reCheckStatus)
        .filter(([pkg, available]) => !available)
        .map(([pkg, available]) => pkg);
        
      if (stillMissing.length > 0) {
        console.error(`[AudioDeps] Still missing packages after installation: ${stillMissing.join(', ')}`);
        return false;
      }
    }
    
    console.log('[AudioDeps] All Python dependencies are available');
    return true;
  } catch (error) {
    console.error('[AudioDeps] Error checking dependencies:', error.message);
    return false;
  }
}

/**
 * Quick check if basic environment is ready
 * @returns {Promise<boolean>} True if basic environment is ready
 */
async function quickCheck() {
  try {
    const pythonAvailable = await checkPython();
    if (!pythonAvailable) {
      return false;
    }
    
    // Quick check for numpy (most critical dependency)
    const packageStatus = await checkPackages(['numpy']);
    return packageStatus.numpy === true;
  } catch (error) {
    console.error('[AudioDeps] Error in quick check:', error.message);
    return false;
  }
}

module.exports = {
  checkPython,
  checkPip,
  installDependencies,
  checkPackages,
  checkDependencies,
  quickCheck,
  getPythonCommand
};

// Run main function if called directly
if (require.main === module) {
  checkDependencies().then((success) => {
    console.log(`Dependencies check ${success ? 'successful' : 'failed'}`);
    process.exit(success ? 0 : 1);
  });
} 