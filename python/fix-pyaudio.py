#!/usr/bin/env python3
"""
Fix PyAudio compilation issues on macOS
This script attempts to fix the common PyAudio symbol errors
"""

import subprocess
import sys
import os

def run_command(cmd, check=True):
    """Run a command and return the result"""
    print(f"Running: {cmd}")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=check)
        if result.stdout:
            print(f"stdout: {result.stdout}")
        if result.stderr:
            print(f"stderr: {result.stderr}")
        return result
    except subprocess.CalledProcessError as e:
        print(f"Command failed with exit code {e.returncode}")
        if e.stdout:
            print(f"stdout: {e.stdout}")
        if e.stderr:
            print(f"stderr: {e.stderr}")
        return e

def fix_pyaudio():
    """Fix PyAudio installation issues"""
    print("🔧 Fixing PyAudio installation issues...")
    
    # Step 1: Uninstall existing PyAudio
    print("\n1. Uninstalling existing PyAudio...")
    run_command("python3 -m pip uninstall pyaudio -y", check=False)
    
    # Step 2: Install portaudio via Homebrew if available
    print("\n2. Checking for Homebrew and portaudio...")
    brew_check = run_command("which brew", check=False)
    if brew_check.returncode == 0:
        print("Homebrew found, installing portaudio...")
        run_command("brew install portaudio", check=False)
    else:
        print("Homebrew not found, skipping portaudio installation")
    
    # Step 3: Try to install PyAudio with specific flags
    print("\n3. Installing PyAudio with compatibility flags...")
    
    # Try different installation methods
    methods = [
        # Method 1: Install with user flag
        "python3 -m pip install --user --upgrade pyaudio",
        
        # Method 2: Install specific version
        "python3 -m pip install --user --upgrade 'pyaudio==0.2.11'",
        
        # Method 3: Install with no cache
        "python3 -m pip install --user --upgrade --no-cache-dir pyaudio",
        
        # Method 4: Install pyaudiowpatch as alternative
        "python3 -m pip install --user --upgrade pyaudiowpatch",
    ]
    
    for i, method in enumerate(methods, 1):
        print(f"\n3.{i} Trying method {i}: {method}")
        result = run_command(method, check=False)
        
        if result.returncode == 0:
            print(f"✅ Method {i} succeeded!")
            
            # Test the installation
            print("Testing PyAudio import...")
            test_result = run_command("python3 -c 'import pyaudio; print(\"PyAudio import successful\")'", check=False)
            
            if test_result.returncode == 0:
                print("✅ PyAudio is working correctly!")
                return True
            else:
                print("❌ PyAudio import still fails, trying next method...")
        else:
            print(f"❌ Method {i} failed, trying next method...")
    
    # Step 4: Try pyaudiowpatch as final fallback
    print("\n4. Final fallback: Installing pyaudiowpatch...")
    result = run_command("python3 -m pip install --user --upgrade pyaudiowpatch", check=False)
    
    if result.returncode == 0:
        test_result = run_command("python3 -c 'import pyaudiowpatch; print(\"pyaudiowpatch import successful\")'", check=False)
        if test_result.returncode == 0:
            print("✅ pyaudiowpatch is working as fallback!")
            return True
    
    print("❌ All methods failed. PyAudio installation could not be fixed.")
    print("\n💡 Manual steps to try:")
    print("1. Install Xcode command line tools: xcode-select --install")
    print("2. Install Homebrew: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"")
    print("3. Install portaudio: brew install portaudio")
    print("4. Install PyAudio: pip3 install --user --upgrade pyaudio")
    
    return False

if __name__ == "__main__":
    print("🔧 PyAudio Fix Utility")
    print("=" * 50)
    
    # Check Python version
    print(f"Python version: {sys.version}")
    print(f"Python executable: {sys.executable}")
    
    success = fix_pyaudio()
    
    if success:
        print("\n🎉 PyAudio fix completed successfully!")
        sys.exit(0)
    else:
        print("\n💥 PyAudio fix failed. Manual intervention required.")
        sys.exit(1) 