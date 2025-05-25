#!/usr/bin/env python3
"""
macOS Audio Installer for Interview Genie
Handles PyAudio compilation issues on macOS, especially Apple Silicon Macs
"""

import subprocess
import sys
import os
import platform
import tempfile
import shutil
from pathlib import Path

def run_command(cmd, check=True, shell=True, capture_output=True):
    """Run a command and return the result"""
    print(f"🔧 Running: {cmd}")
    try:
        result = subprocess.run(
            cmd, 
            shell=shell, 
            capture_output=capture_output, 
            text=True, 
            check=check,
            timeout=300  # 5 minute timeout
        )
        if result.stdout and result.stdout.strip():
            print(f"   stdout: {result.stdout.strip()}")
        if result.stderr and result.stderr.strip():
            print(f"   stderr: {result.stderr.strip()}")
        return result
    except subprocess.CalledProcessError as e:
        print(f"   ❌ Command failed with exit code {e.returncode}")
        if e.stdout:
            print(f"   stdout: {e.stdout}")
        if e.stderr:
            print(f"   stderr: {e.stderr}")
        if not check:
            return e
        raise
    except subprocess.TimeoutExpired:
        print(f"   ⏰ Command timed out after 5 minutes")
        raise

def check_homebrew():
    """Check if Homebrew is installed"""
    try:
        result = run_command("which brew", check=False)
        if result.returncode == 0:
            brew_version = run_command("brew --version", check=False)
            print(f"✅ Homebrew found: {brew_version.stdout.strip().split()[1] if brew_version.returncode == 0 else 'Unknown version'}")
            return True
        else:
            print("❌ Homebrew not found")
            return False
    except Exception as e:
        print(f"❌ Error checking Homebrew: {e}")
        return False

def install_homebrew():
    """Install Homebrew if not present"""
    print("📦 Installing Homebrew...")
    try:
        install_script = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        run_command(install_script, timeout=600)  # 10 minute timeout for Homebrew install
        
        # Add Homebrew to PATH for Apple Silicon Macs
        arch = platform.machine()
        if arch == 'arm64':
            homebrew_path = '/opt/homebrew/bin'
        else:
            homebrew_path = '/usr/local/bin'
            
        current_path = os.environ.get('PATH', '')
        if homebrew_path not in current_path:
            os.environ['PATH'] = f"{homebrew_path}:{current_path}"
            
        return True
    except Exception as e:
        print(f"❌ Failed to install Homebrew: {e}")
        return False

def install_system_dependencies():
    """Install system dependencies via Homebrew"""
    dependencies = [
        'portaudio',
        'ffmpeg', 
        'python@3.11'  # Use specific Python version
    ]
    
    for dep in dependencies:
        print(f"📦 Installing {dep}...")
        try:
            result = run_command(f"brew install {dep}", check=False)
            if result.returncode == 0:
                print(f"✅ {dep} installed successfully")
            else:
                print(f"⚠️  {dep} installation had issues, continuing...")
        except Exception as e:
            print(f"❌ Failed to install {dep}: {e}")

def setup_python_environment():
    """Set up Python environment with proper paths"""
    arch = platform.machine()
    
    # Set up environment variables for compilation
    env_vars = {
        'CPPFLAGS': '-I/opt/homebrew/include' if arch == 'arm64' else '-I/usr/local/include',
        'LDFLAGS': '-L/opt/homebrew/lib' if arch == 'arm64' else '-L/usr/local/lib',
        'PKG_CONFIG_PATH': '/opt/homebrew/lib/pkgconfig' if arch == 'arm64' else '/usr/local/lib/pkgconfig'
    }
    
    for key, value in env_vars.items():
        os.environ[key] = value
        print(f"🔧 Set {key}={value}")

def install_pyaudio_alternatives():
    """Install PyAudio alternatives - install both sounddevice and pyaudio for compatibility"""
    
    python_cmd = sys.executable
    
    print(f"\n🔧 Installing audio packages for compatibility...")
    
    try:
        # First, clean any broken installations
        print("🧹 Cleaning existing audio packages...")
        run_command(f'"{python_cmd}" -m pip uninstall pyaudio sounddevice -y', check=False)
        
        # Install SoundDevice first (primary backend for macOS)
        print("🎵 Installing SoundDevice...")
        install_cmd = f'"{python_cmd}" -m pip install --user --upgrade sounddevice'
        result = run_command(install_cmd, check=False)
        
        if result.returncode == 0:
            # Test SoundDevice
            test_cmd = f'"{python_cmd}" -c "import sounddevice; print(\'sounddevice import successful\')"'
            test_result = run_command(test_cmd, check=False)
            
            if test_result.returncode == 0:
                print("✅ sounddevice installed and working!")
            else:
                print("❌ sounddevice installed but import failed")
                return None
        else:
            print("❌ sounddevice installation failed")
            return None
        
        # Install PyAudio as secondary (needed by AudioRecorder.py)
        print("🎵 Installing PyAudio for compatibility...")
        pyaudio_alternatives = [
            'pyaudio',
            'pyaudio --no-cache-dir --force-reinstall',
            'PyAudio --no-deps'
        ]
        
        pyaudio_installed = False
        for package in pyaudio_alternatives:
            try:
                print(f"   Trying: {package}")
                install_cmd = f'"{python_cmd}" -m pip install --user --upgrade {package}'
                result = run_command(install_cmd, check=False)
                
                if result.returncode == 0:
                    # Test PyAudio
                    test_cmd = f'"{python_cmd}" -c "import pyaudio; print(\'pyaudio import successful\')"'
                    test_result = run_command(test_cmd, check=False)
                    
                    if test_result.returncode == 0:
                        print("✅ pyaudio installed and working!")
                        pyaudio_installed = True
                        break
                    else:
                        print("❌ pyaudio installed but import failed")
                else:
                    print(f"❌ {package} installation failed")
                    
            except Exception as e:
                print(f"❌ Error with {package}: {e}")
        
        if not pyaudio_installed:
            print("⚠️  PyAudio installation failed, but continuing with SoundDevice only")
        
        # Return the primary backend
        return 'sounddevice'
        
    except Exception as e:
        print(f"❌ Audio package installation failed: {e}")
        return None

def create_audio_compatibility_wrapper():
    """Create a wrapper that handles different audio backends"""
    wrapper_code = '''
import sys
import logging

# Audio backend detection and fallback
def get_audio_backend():
    """Detect and return the best available audio backend"""
    
    backends = []
    
    # Try SoundDevice first (most reliable on macOS)
    try:
        import sounddevice as sd
        backends.append(('sounddevice', sd))
    except ImportError:
        pass
    
    # Try PyAudio
    try:
        import pyaudio
        backends.append(('pyaudio', pyaudio))
    except ImportError:
        pass
    
    # Try PyAudioWPatch
    try:
        import pyaudiowpatch as pyaudio
        backends.append(('pyaudiowpatch', pyaudio))
    except ImportError:
        pass
    
    if not backends:
        raise ImportError("No audio backends available")
    
    # Return the first working backend
    for name, module in backends:
        try:
            # Test basic functionality
            if name == 'sounddevice':
                devices = module.query_devices()
                print(f"Using SoundDevice backend with {len(devices)} devices")
                return name, module
            else:
                p = module.PyAudio()
                device_count = p.get_device_count()
                p.terminate()
                print(f"Using {name} backend with {device_count} devices")
                return name, module
        except Exception as e:
            print(f"Backend {name} failed test: {e}")
            continue
    
    raise RuntimeError("No working audio backends found")

# Make this available for import
__all__ = ['get_audio_backend']
'''
    
    wrapper_path = os.path.join(os.path.dirname(__file__), 'audio_backend_detector.py')
    with open(wrapper_path, 'w') as f:
        f.write(wrapper_code)
    
    print(f"✅ Created audio backend detector at {wrapper_path}")

def test_audio_system():
    """Test the installed audio system"""
    print("\n🧪 Testing audio system...")
    
    python_cmd = sys.executable
    
    test_script = '''
import sys
sys.path.insert(0, ".")

try:
    from audio_backend_detector import get_audio_backend
    backend_name, backend_module = get_audio_backend()
    print(f"✅ Audio backend {backend_name} is working")
    
    # Test microphone access
    if backend_name == 'sounddevice':
        devices = backend_module.query_devices(kind='input')
        print(f"✅ Found input devices: {devices['name'] if hasattr(devices, 'name') else 'Multiple devices'}")
    else:
        p = backend_module.PyAudio()
        try:
            default_input = p.get_default_input_device_info()
            print(f"✅ Default input device: {default_input['name']}")
        finally:
            p.terminate()
    
    print("🎉 Audio system test PASSED")
    sys.exit(0)
    
except Exception as e:
    print(f"❌ Audio system test FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
'''
    
    test_file = tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False)
    test_file.write(test_script)
    test_file.close()
    
    try:
        result = run_command(f'"{python_cmd}" "{test_file.name}"', check=False)
        return result.returncode == 0
    finally:
        os.unlink(test_file.name)

def main():
    """Main installation process"""
    print("🎧 macOS Audio Installer for Interview Genie")
    print("=" * 60)
    
    print(f"Platform: {platform.system()} {platform.release()}")
    print(f"Architecture: {platform.machine()}")
    print(f"Python: {sys.version}")
    
    # Step 1: Check/Install Homebrew
    print("\n📦 Step 1: Checking Homebrew...")
    if not check_homebrew():
        if not install_homebrew():
            print("❌ Cannot continue without Homebrew")
            return False
    
    # Step 2: Install system dependencies
    print("\n📦 Step 2: Installing system dependencies...")
    install_system_dependencies()
    
    # Step 3: Set up Python environment
    print("\n🐍 Step 3: Setting up Python environment...")
    setup_python_environment()
    
    # Step 4: Install PyAudio alternatives
    print("\n🎵 Step 4: Installing audio packages...")
    working_backend = install_pyaudio_alternatives()
    
    if not working_backend:
        print("❌ Failed to install any audio backends")
        return False
    
    # Step 5: Create compatibility wrapper
    print("\n🔧 Step 5: Creating compatibility wrapper...")
    create_audio_compatibility_wrapper()
    
    # Step 6: Test the system
    print("\n🧪 Step 6: Testing audio system...")
    if test_audio_system():
        print("\n🎉 macOS audio installation completed successfully!")
        print(f"✅ Working audio backend: {working_backend}")
        return True
    else:
        print("\n❌ Audio system test failed")
        return False

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  Installation interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n💥 Installation failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1) 