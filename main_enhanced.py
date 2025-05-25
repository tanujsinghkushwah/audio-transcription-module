#!/usr/bin/env python3
"""
Enhanced Main Module for Interview Genie Audio Transcription
Uses the new audio compatibility system with multiple backend support
"""

import threading
import queue
import time
import sys
import subprocess
import signal
import os
import atexit
import platform
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Global variables for resources that need cleaning up
transcriber = None
user_audio_recorder = None
speaker_audio_recorder = None
running = True

def cleanup():
    """Clean up resources before exit"""
    print("\nCleaning up resources...")
    global running, transcriber
    running = False
    if transcriber:
        print("Clearing transcript data...")
        try:
            transcriber.clear_transcript_data()
        except Exception as e:
            print(f"Error during cleanup: {e}")
    print("Cleanup completed")

def signal_handler(sig, frame):
    """Handle shutdown signals"""
    print(f"\nReceived signal {sig}, shutting down cleanly...")
    cleanup()
    sys.exit(0)

def register_signal_handlers():
    """Register signal handlers for proper termination"""
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    if sys.platform == 'win32':
        # Windows-specific signal handling would go here
        pass
    
    atexit.register(cleanup)

def check_system_requirements():
    """Check basic system requirements"""
    print("🔍 Checking system requirements...")
    
    # Check FFmpeg
    try:
        result = subprocess.run(["ffmpeg", "-version"], 
                              stdout=subprocess.DEVNULL, 
                              stderr=subprocess.DEVNULL,
                              timeout=10)
        if result.returncode == 0:
            print("✅ FFmpeg is available")
        else:
            print("⚠️  FFmpeg may not be working correctly")
    except FileNotFoundError:
        print("❌ FFmpeg not found - some features may not work")
        print("💡 Install FFmpeg for full functionality")
    except subprocess.TimeoutExpired:
        print("⚠️  FFmpeg check timed out")
    except Exception as e:
        print(f"⚠️  FFmpeg check failed: {e}")

def initialize_audio_system():
    """Initialize the audio system with compatibility checking"""
    print("\n🎧 Initializing audio system...")
    
    # Check if enhanced startup already handled macOS setup
    enhanced_startup_completed = os.environ.get('ENHANCED_STARTUP_COMPLETED') == 'true'
    
    # First, try to run macOS installer if needed (but skip if enhanced startup already did it)
    if platform.system() == 'Darwin' and not enhanced_startup_completed:
        print("🍎 Detected macOS - checking audio setup...")
        try:
            # Try to run the macOS audio installer
            installer_path = os.path.join(os.path.dirname(__file__), 'macos_audio_installer.py')
            if os.path.exists(installer_path):
                print("🔧 Running macOS audio installer...")
                result = subprocess.run([sys.executable, installer_path], 
                                      capture_output=True, text=True, timeout=300)
                
                if result.returncode == 0:
                    print("✅ macOS audio setup completed successfully")
                else:
                    print(f"⚠️  macOS audio setup had issues: {result.stderr}")
                    print("💡 Continuing with fallback options...")
            else:
                print("⚠️  macOS audio installer not found, using fallback")
        except Exception as e:
            print(f"⚠️  macOS audio installer failed: {e}")
            print("💡 Continuing with fallback options...")
    elif platform.system() == 'Darwin' and enhanced_startup_completed:
        print("🍎 Detected macOS - enhanced startup already completed audio setup")
    
    # Try to initialize audio compatibility
    try:
        from audio_compatibility import check_audio_compatibility
        if check_audio_compatibility():
            print("✅ Audio compatibility check passed")
            return True
        else:
            print("❌ Audio compatibility check failed")
            return False
    except ImportError:
        print("⚠️  Audio compatibility module not available, using legacy mode")
        return check_legacy_audio()
    except Exception as e:
        print(f"❌ Audio compatibility check error: {e}")
        return check_legacy_audio()

def check_legacy_audio():
    """Legacy audio check for fallback"""
    print("🔄 Trying legacy audio detection...")
    
    # Try different audio imports
    audio_backends = []
    
    # Test SoundDevice
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        print(f"✅ SoundDevice available with {len(devices)} devices")
        audio_backends.append('sounddevice')
    except ImportError:
        print("❌ SoundDevice not available")
    except Exception as e:
        print(f"❌ SoundDevice error: {e}")
    
    # Test PyAudio
    try:
        import pyaudio
        p = pyaudio.PyAudio()
        device_count = p.get_device_count()
        p.terminate()
        print(f"✅ PyAudio available with {device_count} devices")
        audio_backends.append('pyaudio')
    except ImportError:
        print("❌ PyAudio not available")
    except Exception as e:
        print(f"❌ PyAudio error: {e}")
    
    # Test PyAudioWPatch
    try:
        import pyaudiowpatch as pyaudio
        p = pyaudio.PyAudio()
        device_count = p.get_device_count()
        p.terminate()
        print(f"✅ PyAudioWPatch available with {device_count} devices")
        audio_backends.append('pyaudiowpatch')
    except ImportError:
        print("❌ PyAudioWPatch not available")
    except Exception as e:
        print(f"❌ PyAudioWPatch error: {e}")
    
    if audio_backends:
        print(f"✅ Found working audio backends: {', '.join(audio_backends)}")
        return True
    else:
        print("❌ No working audio backends found")
        return False

def initialize_recorders():
    """Initialize audio recorders with error handling"""
    global user_audio_recorder, speaker_audio_recorder
    
    print("\n🎤 Initializing audio recorders...")
    
    try:
        # Import AudioRecorder
        import AudioRecorder
        
        # Initialize microphone recorder
        print("🎤 Setting up microphone recorder...")
        user_audio_recorder = AudioRecorder.DefaultMicRecorder()
        print("✅ Microphone recorder initialized")
        
        # Initialize speaker recorder
        print("🔊 Setting up speaker recorder...")
        speaker_audio_recorder = AudioRecorder.DefaultSpeakerRecorder()
        print("✅ Speaker recorder initialized")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize recorders: {e}")
        print(f"❌ Recorder initialization failed: {e}")
        return False

def initialize_transcriber():
    """Initialize the transcription model"""
    print("\n🧠 Initializing transcription model...")
    
    try:
        import TranscriberModels
        
        # Check if API mode is requested
        use_api = '--api' in sys.argv
        
        print(f"🔧 Loading model (API mode: {use_api})...")
        model = TranscriberModels.get_model(use_api)
        print("✅ Transcription model loaded")
        
        return model
        
    except Exception as e:
        logger.error(f"Failed to initialize transcriber: {e}")
        print(f"❌ Transcriber initialization failed: {e}")
        return None

def start_transcription_service(model):
    """Start the transcription service"""
    global transcriber, running
    
    print("\n🚀 Starting transcription service...")
    
    try:
        # Import AudioTranscriber
        from AudioTranscriber import AudioTranscriber
        
        # Create queues
        speaker_queue = queue.Queue()
        mic_queue = queue.Queue()
        
        # Start recording
        print("🎤 Starting microphone recording...")
        user_audio_recorder.record_into_queue(mic_queue)
        
        print("🔊 Starting speaker recording...")  
        speaker_audio_recorder.record_into_queue(speaker_queue)
        
        # Initialize transcriber
        print("🧠 Initializing transcriber...")
        transcriber = AudioTranscriber(
            user_audio_recorder.source, 
            speaker_audio_recorder.source, 
            model
        )
        
        # Start transcription thread
        print("📝 Starting transcription thread...")
        transcribe_thread = threading.Thread(
            target=transcriber.transcribe_audio_queue, 
            args=(speaker_queue, mic_queue)
        )
        transcribe_thread.daemon = True
        transcribe_thread.start()
        
        print("✅ Transcription service started successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to start transcription service: {e}")
        print(f"❌ Transcription service failed: {e}")
        return False

def create_status_file():
    """Create a status file indicating the module is running"""
    try:
        status_file = os.path.join(os.path.dirname(__file__), 'module_status.json')
        status = {
            "running": True,
            "platform": platform.system(),
            "python_version": sys.version,
            "start_time": datetime.now().isoformat(),
            "audio_available": True
        }
        
        import json
        with open(status_file, 'w') as f:
            json.dump(status, f, indent=2)
        
        print(f"✅ Status file created: {status_file}")
        
    except Exception as e:
        print(f"⚠️  Could not create status file: {e}")

def main():
    """Main function with comprehensive initialization"""
    print("🎧 Interview Genie Audio Transcription Module (Enhanced)")
    print("=" * 65)
    
    print(f"🖥️  Platform: {platform.system()} {platform.release()}")
    print(f"🐍 Python: {sys.version.split()[0]}")
    print(f"🏗️  Architecture: {platform.machine()}")
    
    # Register signal handlers
    register_signal_handlers()
    
    # Step 1: Check system requirements
    check_system_requirements()
    
    # Step 2: Initialize audio system
    if not initialize_audio_system():
        print("\n❌ CRITICAL: Audio system initialization failed")
        print("💡 Try running the following to fix audio issues:")
        if platform.system() == 'Darwin':
            print("   python3 macos_audio_installer.py")
        else:
            print("   pip install --user --upgrade sounddevice pyaudio")
        
        # Keep running with limited functionality
        print("\n⚠️  Running in limited mode without audio transcription...")
        
        try:
            while running:
                time.sleep(10)
                print("⚠️  Audio module running without transcription (audio system unavailable)")
        except KeyboardInterrupt:
            print("\nExiting...")
        
        return
    
    # Step 3: Initialize recorders
    if not initialize_recorders():
        print("\n❌ CRITICAL: Audio recorder initialization failed")
        return
    
    # Step 4: Initialize transcription model
    model = initialize_transcriber()
    if not model:
        print("\n❌ CRITICAL: Transcription model initialization failed")
        return
    
    # Step 5: Start transcription service
    if not start_transcription_service(model):
        print("\n❌ CRITICAL: Transcription service failed to start")
        return
    
    # Step 6: Create status file
    create_status_file()
    
    # Success!
    print("\n🎉 Audio Transcription Module Ready!")
    print("📂 Transcripts are being saved to the 'transcripts' folder")
    print("⏹️  Press Ctrl+C to exit")
    
    # Main loop
    try:
        while running:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n⚠️  Shutdown signal received...")
    finally:
        cleanup()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Fatal error in main: {e}")
        print(f"\n💥 Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1) 