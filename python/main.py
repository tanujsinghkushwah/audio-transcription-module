#!/usr/bin/env python3

import sys
import os

# Add parent directory to Python path to find custom_speech_recognition module
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

import threading
from AudioTranscriber import AudioTranscriber
import AudioRecorder
import queue
import time
import sys
import TranscriberModels
import subprocess
import signal
import atexit
import platform

# Global variables for resources that need cleaning up
transcriber = None
user_audio_recorder = None
speaker_audio_recorder = None
running = True

def cleanup():
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
    print(f"\nReceived signal {sig}, shutting down cleanly...")
    cleanup()
    sys.exit(0)

def register_signal_handlers():
    # Register signal handlers for proper termination
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # On Windows, CTRL_C_EVENT and CTRL_BREAK_EVENT are not usable directly
    # as they cause ValueError exceptions with signal.signal
    if sys.platform == 'win32':
        # Skip registering Windows-specific control signals as they're not
        # properly supported in Python's signal module in this context
        pass
    
    # Register atexit handler as a fallback
    atexit.register(cleanup)

# Add macOS permission checking
def check_macos_permissions():
    """Check and request microphone permissions on macOS"""
    if platform.system() != 'Darwin':
        return True
    
    try:
        # Try to import and use a simple audio test
        import pyaudio
        
        # Test if we can access the audio system
        p = pyaudio.PyAudio()
        
        # Try to get default input device info
        try:
            default_input = p.get_default_input_device_info()
            print(f"[INFO] Default input device: {default_input['name']}")
            
            # Try to create a test stream
            try:
                test_stream = p.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=44100,
                    input=True,
                    frames_per_buffer=1024
                )
                test_stream.close()
                p.terminate()
                print("[INFO] ✅ Microphone access confirmed")
                return True
            except Exception as stream_error:
                print(f"[ERROR] ❌ Cannot create audio stream: {stream_error}")
                p.terminate()
                return False
                
        except Exception as device_error:
            print(f"[ERROR] ❌ Cannot access input device: {device_error}")
            p.terminate()
            return False
            
    except Exception as e:
        print(f"[ERROR] ❌ Audio system access failed: {e}")
        print("[INFO] 🔧 Please grant microphone permissions in System Preferences > Security & Privacy > Privacy > Microphone")
        return False

def main():
    print("=== Interview Genie Audio Transcription Module ===")
    print(f"Platform: {platform.system()} {platform.release()}")
    print(f"Python: {sys.version}")
    
    # Check macOS permissions first
    if not check_macos_permissions():
        print("\n❌ CRITICAL: Microphone access denied or unavailable")
        print("🔧 SOLUTION:")
        print("1. Open System Preferences > Security & Privacy > Privacy")
        print("2. Select 'Microphone' from the left panel")
        print("3. Check the box next to 'Electron' or your app name")
        print("4. Restart the application")
        print("\nPress Ctrl+C to exit...")
        
        # Keep the process alive but in a failed state
        try:
            while True:
                time.sleep(10)
                print("⚠️  Still waiting for microphone permissions...")
        except KeyboardInterrupt:
            print("\nExiting...")
            sys.exit(1)
    
    # Continue with original main.py logic
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        print("ERROR: The ffmpeg library is not installed. Please install ffmpeg and try again.")
        return

    # Register all signal handlers for clean termination
    register_signal_handlers()

    speaker_queue = queue.Queue()
    mic_queue = queue.Queue()

    user_audio_recorder = AudioRecorder.DefaultMicRecorder()
    user_audio_recorder.record_into_queue(mic_queue)

    print("Initializing audio recorders...")
    time.sleep(2)

    speaker_audio_recorder = AudioRecorder.DefaultSpeakerRecorder()
    speaker_audio_recorder.record_into_queue(speaker_queue)

    model = TranscriberModels.get_model('--api' in sys.argv)

    print("Starting transcription...")
    transcriber = AudioTranscriber(user_audio_recorder.source, speaker_audio_recorder.source, model)
    transcribe = threading.Thread(target=transcriber.transcribe_audio_queue, args=(speaker_queue, mic_queue))
    transcribe.daemon = True
    transcribe.start()

    print("READY - Ecoute is now running")
    print("Transcripts are being saved to the 'transcripts' folder")
    print("Press Ctrl+C to exit")
    
    # Keep the main thread alive with better detection of program termination
    try:
        while running:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nKeyboardInterrupt received, exiting...")
    finally:
        # Ensure cleanup happens
        cleanup()

if __name__ == "__main__":
    main()