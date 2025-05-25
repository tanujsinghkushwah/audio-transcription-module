#!/usr/bin/env python3
"""
Minimal Python runtime checker for Interview Genie
This script verifies that Python and basic dependencies are available
"""

import sys
import platform
import traceback

def check_macos_audio_permissions():
    """
    Check if macOS audio permissions are properly configured
    Returns True if audio access is available, False otherwise
    """
    if platform.system() != 'Darwin':
        print("Not running on macOS - skipping audio permission check")
        return True
    
    try:
        print("Checking macOS audio permissions...")
        
        # Test basic audio system access
        import pyaudio
        
        # Initialize PyAudio
        p = pyaudio.PyAudio()
        
        try:
            # Try to get default input device info
            default_input = p.get_default_input_device_info()
            print(f"Default input device: {default_input['name']}")
            
            # Try to create a minimal test stream
            test_stream = p.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=16000,  # Lower sample rate for minimal test
                input=True,
                frames_per_buffer=512,
                start=False  # Don't start immediately
            )
            
            # Just check if stream can be created without actually starting it
            print("Audio stream creation successful - permissions OK")
            test_stream.close()
            p.terminate()
            return True
            
        except Exception as stream_error:
            error_msg = str(stream_error)
            print(f"Audio stream creation failed: {error_msg}")
            
            # Check for specific macOS permission errors
            if "PaMacCore" in error_msg or "err='-50'" in error_msg:
                print("ERROR: macOS microphone permission denied")
                print("SOLUTION: Grant microphone permissions in System Preferences > Security & Privacy > Privacy > Microphone")
                sys.exit(50)  # Use exit code 50 to indicate permission error
            
            p.terminate()
            return False
            
    except ImportError as e:
        print(f"PyAudio not available: {e}")
        print("Audio transcription will not work without PyAudioWPatch")
        return False
    except Exception as e:
        print(f"Unexpected error during audio permission check: {e}")
        traceback.print_exc()
        return False

def check_python_dependencies():
    """
    Check if required Python packages are available
    """
    required_packages = [
        ('numpy', 'numpy'),
        ('torch', 'torch'),
        ('faster_whisper', 'faster-whisper'),
        ('pyaudio', 'PyAudioWPatch')
    ]
    
    missing_packages = []
    
    for package_import, package_name in required_packages:
        try:
            __import__(package_import)
            print(f"✓ {package_name} available")
        except ImportError:
            print(f"✗ {package_name} missing")
            missing_packages.append(package_name)
    
    if missing_packages:
        print(f"Missing packages: {', '.join(missing_packages)}")
        print("Run: pip install -r requirements.txt")
        return False
    
    return True

def main():
    """
    Main runtime check function
    """
    print("=== Interview Genie Audio Module Runtime Check ===")
    print(f"Platform: {platform.system()} {platform.release()}")
    print(f"Python: {sys.version}")
    print()
    
    # Check dependencies first
    print("1. Checking Python dependencies...")
    deps_ok = check_python_dependencies()
    
    if not deps_ok:
        print("CRITICAL: Missing Python dependencies")
        sys.exit(1)
    
    print()
    
    # Check audio permissions
    print("2. Checking audio permissions...")
    audio_ok = check_macos_audio_permissions()
    
    if not audio_ok:
        print("CRITICAL: Audio permissions not available")
        sys.exit(2)
    
    print()
    print("✅ All runtime checks passed - audio module should work correctly")
    return True

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nRuntime check interrupted")
        sys.exit(130)
    except Exception as e:
        print(f"Runtime check failed with error: {e}")
        traceback.print_exc()
        sys.exit(1)
