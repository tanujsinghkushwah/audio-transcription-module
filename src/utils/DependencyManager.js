/**
 * Dependency Manager - Handles Python dependencies and runtime setup
 * Ensures all required Python packages are available
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class DependencyManager {
  constructor(config, pathManager) {
    this.config = config;
    this.pathManager = pathManager;
    this.platform = os.platform();
  }

  /**
   * Ensure all dependencies are available
   */
  async ensureDependencies() {
    try {
      console.log('Checking Python dependencies...');
      
      // Check Python installation
      const pythonOk = await this.checkPython();
      if (!pythonOk) {
        console.warn('Python check failed, but continuing...');
        return false;
      }
      
      // Check if we're in a packaged environment with embedded dependencies
      if (this.pathManager.isPackaged) {
        const embeddedOk = await this.checkEmbeddedDependencies();
        if (embeddedOk) {
          console.log('Using embedded Python dependencies');
          return true;
        }
      }
      
      // Check/install Python packages
      const packagesOk = await this.checkPythonPackages();
      if (!packagesOk) {
        console.warn('Some Python packages may be missing');
        
        // Try to install missing packages
        const installOk = await this.installMissingPackages();
        if (!installOk) {
          console.warn('Failed to install some packages, but continuing...');
        }
      }
      
      // Platform-specific setup
      await this.platformSpecificSetup();
      
      console.log('Dependency check completed');
      return true;
    } catch (error) {
      console.error('Error ensuring dependencies:', error);
      return false;
    }
  }

  /**
   * Check Python installation
   */
  async checkPython() {
    try {
      const pythonPath = this.pathManager.getPythonExecutable();
      
      return new Promise((resolve) => {
        const process = spawn(pythonPath, ['--version'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        
        process.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        process.stderr.on('data', (data) => {
          output += data.toString();
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            console.log(`Python version: ${output.trim()}`);
            resolve(true);
          } else {
            console.error(`Python check failed with code ${code}: ${output}`);
            resolve(false);
          }
        });
        
        process.on('error', (error) => {
          console.error('Python executable not found:', error.message);
          resolve(false);
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          process.kill();
          console.error('Python version check timed out');
          resolve(false);
        }, 10000);
      });
    } catch (error) {
      console.error('Error checking Python:', error);
      return false;
    }
  }

  /**
   * Check for embedded dependencies in packaged builds
   */
  async checkEmbeddedDependencies() {
    try {
      const runtimeDir = path.join(this.pathManager.getAudioModuleDirectory(), 'runtime');
      const embeddedPython = path.join(runtimeDir, 'python-portable');
      
      if (fs.existsSync(embeddedPython)) {
        console.log('Found embedded Python runtime');
        return true;
      }
      
      // Check for pre-installed packages directory
      const packagesDir = path.join(runtimeDir, 'dependencies');
      if (fs.existsSync(packagesDir)) {
        console.log('Found embedded Python packages');
        
        // Add to PYTHONPATH
        const currentPath = process.env.PYTHONPATH || '';
        process.env.PYTHONPATH = currentPath ? `${packagesDir}:${currentPath}` : packagesDir;
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking embedded dependencies:', error);
      return false;
    }
  }

  /**
   * Check required Python packages
   */
  async checkPythonPackages() {
    try {
      const requiredPackages = [
        'pyaudio',
        'speech_recognition',
        'wave',
        'threading',
        'queue',
        'tempfile'
      ];
      
      const pythonPath = this.pathManager.getPythonExecutable();
      
      for (const packageName of requiredPackages) {
        const available = await this.checkSinglePackage(pythonPath, packageName);
        if (!available) {
          console.warn(`Package ${packageName} not available`);
          return false;
        }
      }
      
      console.log('All required Python packages are available');
      return true;
    } catch (error) {
      console.error('Error checking Python packages:', error);
      return false;
    }
  }

  /**
   * Check if a single Python package is available
   */
  async checkSinglePackage(pythonPath, packageName) {
    return new Promise((resolve) => {
      const process = spawn(pythonPath, ['-c', `import ${packageName}; print("${packageName} OK")`], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let success = false;
      
      process.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes(`${packageName} OK`)) {
          success = true;
        }
      });
      
      process.on('close', (code) => {
        resolve(success && code === 0);
      });
      
      process.on('error', () => {
        resolve(false);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Install missing Python packages
   */
  async installMissingPackages() {
    try {
      console.log('Attempting to install missing Python packages...');
      
      const requirementsPath = this.pathManager.getRequirementsPath();
      
      if (!fs.existsSync(requirementsPath)) {
        console.warn('Requirements file not found, cannot install packages');
        return false;
      }
      
      const pythonPath = this.pathManager.getPythonExecutable();
      
      // Try to install using pip
      return new Promise((resolve) => {
        const process = spawn(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: this.pathManager.getPythonDirectory()
        });
        
        let output = '';
        
        process.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          console.log(`[pip] ${text.trim()}`);
        });
        
        process.stderr.on('data', (data) => {
          const text = data.toString();
          output += text;
          console.warn(`[pip] ${text.trim()}`);
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            console.log('Python packages installed successfully');
            resolve(true);
          } else {
            console.error(`Package installation failed with code ${code}`);
            resolve(false);
          }
        });
        
        process.on('error', (error) => {
          console.error('Error running pip install:', error.message);
          resolve(false);
        });
        
        // Timeout after 5 minutes
        setTimeout(() => {
          process.kill();
          console.error('Package installation timed out');
          resolve(false);
        }, 300000);
      });
    } catch (error) {
      console.error('Error installing packages:', error);
      return false;
    }
  }

  /**
   * Platform-specific setup
   */
  async platformSpecificSetup() {
    try {
      if (this.platform === 'darwin') {
        await this.setupMacOS();
      } else if (this.platform === 'win32') {
        await this.setupWindows();
      } else if (this.platform === 'linux') {
        await this.setupLinux();
      }
    } catch (error) {
      console.error('Error in platform-specific setup:', error);
    }
  }

  /**
   * macOS-specific setup
   */
  async setupMacOS() {
    try {
      console.log('Running macOS-specific setup...');
      
      // Check for macOS audio permissions
      await this.checkMacOSAudioPermissions();
      
      // Check for Homebrew dependencies
      await this.checkBrewDependencies();
      
      console.log('macOS setup completed');
    } catch (error) {
      console.warn('macOS setup had issues:', error.message);
    }
  }

  /**
   * Check macOS audio permissions
   */
  async checkMacOSAudioPermissions() {
    try {
      // This is a basic check - the actual permission request happens in Python
      console.log('macOS audio permissions will be checked by Python process');
      return true;
    } catch (error) {
      console.warn('Error checking macOS audio permissions:', error);
      return false;
    }
  }

  /**
   * Check for Homebrew dependencies (PyAudio requirements)
   */
  async checkBrewDependencies() {
    try {
      return new Promise((resolve) => {
        exec('brew list portaudio', (error, stdout, stderr) => {
          if (error) {
            console.warn('portaudio not found via Homebrew, PyAudio may not work properly');
            console.warn('Consider running: brew install portaudio');
            resolve(false);
          } else {
            console.log('portaudio found via Homebrew');
            resolve(true);
          }
        });
        
        // Don't wait too long for this check
        setTimeout(() => resolve(false), 5000);
      });
    } catch (error) {
      console.warn('Error checking Homebrew dependencies:', error);
      return false;
    }
  }

  /**
   * Windows-specific setup
   */
  async setupWindows() {
    try {
      console.log('Running Windows-specific setup...');
      
      // Windows usually works out of the box with proper Python installation
      console.log('Windows setup completed');
    } catch (error) {
      console.warn('Windows setup had issues:', error.message);
    }
  }

  /**
   * Linux-specific setup
   */
  async setupLinux() {
    try {
      console.log('Running Linux-specific setup...');
      
      // Check for ALSA/PulseAudio
      await this.checkLinuxAudio();
      
      console.log('Linux setup completed');
    } catch (error) {
      console.warn('Linux setup had issues:', error.message);
    }
  }

  /**
   * Check Linux audio system
   */
  async checkLinuxAudio() {
    try {
      return new Promise((resolve) => {
        exec('which aplay', (error) => {
          if (error) {
            console.warn('ALSA tools not found, audio may not work properly');
            console.warn('Consider installing: sudo apt-get install alsa-utils');
          } else {
            console.log('ALSA tools found');
          }
          resolve(!error);
        });
        
        setTimeout(() => resolve(false), 3000);
      });
    } catch (error) {
      console.warn('Error checking Linux audio:', error);
      return false;
    }
  }

  /**
   * Get dependency status
   */
  async getStatus() {
    return {
      platform: this.platform,
      pythonAvailable: await this.checkPython(),
      embeddedDependencies: this.pathManager.isPackaged ? await this.checkEmbeddedDependencies() : false,
      packagesAvailable: await this.checkPythonPackages()
    };
  }
}

module.exports = DependencyManager; 