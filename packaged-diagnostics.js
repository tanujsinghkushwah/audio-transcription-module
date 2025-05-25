/**
 * Comprehensive diagnostics for packaged builds
 * This script helps identify why the audio module isn't working in production
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const logger = console;

/**
 * Run comprehensive diagnostics for packaged builds
 */
async function runPackagedDiagnostics() {
  logger.log('=== Interview Genie Packaged Build Diagnostics ===');
  logger.log(`Platform: ${process.platform}`);
  logger.log(`Architecture: ${process.arch}`);
  logger.log(`Node.js: ${process.version}`);
  logger.log(`Working Directory: ${process.cwd()}`);
  logger.log(`Script Directory: ${__dirname}`);
  
  const results = {
    environment: {},
    python: {},
    files: {},
    permissions: {},
    audio: {}
  };
  
  // 1. Environment Check
  logger.log('\n1. Environment Check...');
  try {
    const { app } = require('electron');
    results.environment.isPackaged = app ? app.isPackaged : 'unknown';
    results.environment.appPath = app ? app.getAppPath() : 'unknown';
    results.environment.userData = app ? app.getPath('userData') : 'unknown';
    results.environment.resourcesPath = process.resourcesPath || 'unknown';
    
    logger.log(`  ✓ Packaged: ${results.environment.isPackaged}`);
    logger.log(`  ✓ App Path: ${results.environment.appPath}`);
    logger.log(`  ✓ User Data: ${results.environment.userData}`);
    logger.log(`  ✓ Resources: ${results.environment.resourcesPath}`);
  } catch (error) {
    logger.error(`  ✗ Environment check failed: ${error.message}`);
    results.environment.error = error.message;
  }
  
  // 2. Python Check
  logger.log('\n2. Python Environment Check...');
  const pythonCommands = ['python3', 'python'];
  
  for (const pythonCmd of pythonCommands) {
    try {
      const version = execSync(`${pythonCmd} --version`, { 
        encoding: 'utf8', 
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      results.python[pythonCmd] = {
        available: true,
        version: version.trim()
      };
      logger.log(`  ✓ ${pythonCmd}: ${version.trim()}`);
    } catch (error) {
      results.python[pythonCmd] = {
        available: false,
        error: error.message
      };
      logger.log(`  ✗ ${pythonCmd}: Not available`);
    }
  }
  
  // 3. Python Dependencies Check
  logger.log('\n3. Python Dependencies Check...');
  const requiredPackages = ['numpy', 'torch', 'faster_whisper', 'pyaudio'];
  
  for (const pkg of requiredPackages) {
    try {
      const pythonCmd = results.python.python3?.available ? 'python3' : 'python';
      execSync(`${pythonCmd} -c "import ${pkg}"`, { 
        encoding: 'utf8', 
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      results.python[`package_${pkg}`] = true;
      logger.log(`  ✓ ${pkg}: Available`);
    } catch (error) {
      results.python[`package_${pkg}`] = false;
      logger.log(`  ✗ ${pkg}: Missing`);
    }
  }
  
  // 4. File System Check
  logger.log('\n4. File System Check...');
  const criticalFiles = [
    'main.py',
    'startup.js',
    'python-runner.js',
    'install-dependencies.js',
    'requirements.txt',
    'runtime-check.py'
  ];
  
  for (const file of criticalFiles) {
    const filePath = path.join(__dirname, file);
    const exists = fs.existsSync(filePath);
    results.files[file] = {
      exists,
      path: filePath
    };
    
    if (exists) {
      try {
        const stats = fs.statSync(filePath);
        results.files[file].size = stats.size;
        results.files[file].readable = fs.constants.R_OK;
        logger.log(`  ✓ ${file}: ${stats.size} bytes`);
      } catch (error) {
        results.files[file].error = error.message;
        logger.log(`  ✗ ${file}: Error reading - ${error.message}`);
      }
    } else {
      logger.log(`  ✗ ${file}: Missing`);
    }
  }
  
  // 5. Transcripts Directory Check
  logger.log('\n5. Transcripts Directory Check...');
  const transcriptsDir = path.join(__dirname, 'transcripts');
  try {
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
      logger.log(`  ✓ Created transcripts directory: ${transcriptsDir}`);
    } else {
      logger.log(`  ✓ Transcripts directory exists: ${transcriptsDir}`);
    }
    
    // Check if we can write to it
    const testFile = path.join(transcriptsDir, 'test_write.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    results.files.transcriptsWritable = true;
    logger.log(`  ✓ Transcripts directory is writable`);
  } catch (error) {
    results.files.transcriptsWritable = false;
    results.files.transcriptsError = error.message;
    logger.log(`  ✗ Transcripts directory error: ${error.message}`);
  }
  
  // 6. Audio Permissions Check (macOS)
  if (process.platform === 'darwin') {
    logger.log('\n6. macOS Audio Permissions Check...');
    try {
      const runtimeCheckPath = path.join(__dirname, 'runtime-check.py');
      if (fs.existsSync(runtimeCheckPath)) {
        const pythonCmd = results.python.python3?.available ? 'python3' : 'python';
        
        const permissionCheck = spawn(pythonCmd, [runtimeCheckPath], {
          cwd: __dirname,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        permissionCheck.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        permissionCheck.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        await new Promise((resolve) => {
          permissionCheck.on('close', (code) => {
            results.audio.permissionCheckCode = code;
            results.audio.permissionOutput = output.trim();
            results.audio.permissionError = errorOutput.trim();
            
            if (code === 0) {
              logger.log(`  ✓ Audio permissions check passed`);
            } else if (code === 50) {
              logger.log(`  ✗ macOS microphone permission denied`);
              logger.log(`  💡 SOLUTION: Grant microphone permissions in System Preferences`);
            } else {
              logger.log(`  ✗ Audio permissions check failed (code: ${code})`);
            }
            
            if (errorOutput.includes('PaMacCore') || errorOutput.includes('err=\'-50\'')) {
              logger.log(`  ✗ Detected macOS audio permission error`);
              results.audio.macosPermissionIssue = true;
            }
            
            resolve();
          });
        });
      } else {
        logger.log(`  ✗ runtime-check.py not found`);
        results.audio.runtimeCheckMissing = true;
      }
    } catch (error) {
      logger.log(`  ✗ Audio permission check error: ${error.message}`);
      results.audio.error = error.message;
    }
  }
  
  // 7. Quick Python Script Test
  logger.log('\n7. Quick Python Script Test...');
  try {
    const pythonCmd = results.python.python3?.available ? 'python3' : 'python';
    const testScript = 'import sys; print("Python test OK"); print("Version:", sys.version.split()[0])';
    
    const testResult = execSync(`${pythonCmd} -c '${testScript}'`, {
      encoding: 'utf8',
      timeout: 10000,
      cwd: __dirname
    });
    
    results.python.scriptTest = {
      success: true,
      output: testResult.trim()
    };
    logger.log(`  ✓ Python script execution successful`);
  } catch (error) {
    results.python.scriptTest = {
      success: false,
      error: error.message
    };
    logger.log(`  ✗ Python script execution failed: ${error.message}`);
  }
  
  // 8. Summary and Recommendations
  logger.log('\n8. Summary and Recommendations...');
  
  const issues = [];
  const recommendations = [];
  
  // Check for common issues
  if (!results.python.python3?.available && !results.python.python?.available) {
    issues.push('Python not available');
    recommendations.push('Install Python 3.7+ on the system');
  }
  
  const missingPackages = requiredPackages.filter(pkg => !results.python[`package_${pkg}`]);
  if (missingPackages.length > 0) {
    issues.push(`Missing Python packages: ${missingPackages.join(', ')}`);
    recommendations.push('Run: pip install -r requirements.txt');
  }
  
  if (results.audio.macosPermissionIssue) {
    issues.push('macOS microphone permission denied');
    recommendations.push('Grant microphone permissions in System Preferences > Security & Privacy > Privacy > Microphone');
  }
  
  if (!results.files.transcriptsWritable) {
    issues.push('Cannot write to transcripts directory');
    recommendations.push('Check file system permissions');
  }
  
  if (issues.length === 0) {
    logger.log('  ✅ No critical issues detected - audio module should work');
  } else {
    logger.log('  ❌ Issues detected:');
    issues.forEach(issue => logger.log(`     - ${issue}`));
    logger.log('  💡 Recommendations:');
    recommendations.forEach(rec => logger.log(`     - ${rec}`));
  }
  
  logger.log('\n=== Diagnostics Complete ===');
  return results;
}

module.exports = {
  runPackagedDiagnostics
};

// Run diagnostics if called directly
if (require.main === module) {
  runPackagedDiagnostics().then((results) => {
    console.log('\nDiagnostics completed. Results saved to diagnostics object.');
  }).catch((error) => {
    console.error('Diagnostics failed:', error);
  });
} 