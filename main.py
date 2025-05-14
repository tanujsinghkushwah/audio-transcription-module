import threading
from AudioTranscriber import AudioTranscriber
import AudioRecorder
import queue
import time
import sys
import TranscriberModels
import subprocess
import signal
import os
import atexit

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

def main():
    global transcriber, user_audio_recorder, speaker_audio_recorder, running

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