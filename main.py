import threading
from AudioTranscriber import AudioTranscriber
import AudioRecorder
import queue
import time
import sys
import TranscriberModels
import subprocess
import signal

def clear_context(transcriber, speaker_queue, mic_queue):
    transcriber.clear_transcript_data()

    with speaker_queue.mutex:
        speaker_queue.queue.clear()
    with mic_queue.mutex:
        mic_queue.queue.clear()

def signal_handler(sig, frame):
    print("\nExiting Ecoute...")
    sys.exit(0)

def main():
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        print("ERROR: The ffmpeg library is not installed. Please install ffmpeg and try again.")
        return

    # Register signal handler for graceful exit
    signal.signal(signal.SIGINT, signal_handler)

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
    
    # Keep the main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting Ecoute...")

if __name__ == "__main__":
    main()