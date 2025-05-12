import custom_speech_recognition as sr
import pyaudiowpatch as pyaudio
from datetime import datetime
import threading
import time

RECORD_TIMEOUT = 3
ENERGY_THRESHOLD = 1000
DYNAMIC_ENERGY_THRESHOLD = False
AMBIENT_ADJUSTMENT_TIMEOUT = 5  # Timeout in seconds

class BaseRecorder:
    def __init__(self, source):
        self.recorder = sr.Recognizer()
        self.recorder.energy_threshold = ENERGY_THRESHOLD
        self.recorder.dynamic_energy_threshold = DYNAMIC_ENERGY_THRESHOLD

        if source is None:
            raise ValueError("audio source can't be None")

        self.source = source

    def adjust_for_noise(self, device_name, msg):
        print(f"[INFO] Adjusting for ambient noise from {device_name}. " + msg)
        
        # Set a default energy threshold instead of doing ambient noise adjustment for speakers
        # This prevents the context manager issues
        if "Speaker" in device_name:
            print(f"[INFO] Using default energy threshold for {device_name}.")
            return
            
        # For microphone, do a simpler adjustment with shorter duration
        try:
            with self.source as source:
                self.recorder.adjust_for_ambient_noise(source, duration=1)
            print(f"[INFO] Completed ambient noise adjustment for {device_name}.")
        except Exception as e:
            print(f"[WARN] Error during ambient noise adjustment for {device_name}: {e}")
            print(f"[INFO] Using default energy threshold for {device_name}.")

    def record_into_queue(self, audio_queue):
        def record_callback(_, audio:sr.AudioData) -> None:
            data = audio.get_raw_data()
            audio_queue.put((data, datetime.utcnow()))

        self.recorder.listen_in_background(self.source, record_callback, phrase_time_limit=RECORD_TIMEOUT)

class DefaultMicRecorder(BaseRecorder):
    def __init__(self):
        super().__init__(source=sr.Microphone(sample_rate=16000))
        self.adjust_for_noise("Default Mic", "Please make some noise from the Default Mic...")

class DefaultSpeakerRecorder(BaseRecorder):
    def __init__(self):
        with pyaudio.PyAudio() as p:
            wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
            default_speakers = p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
            
            if not default_speakers["isLoopbackDevice"]:
                for loopback in p.get_loopback_device_info_generator():
                    if default_speakers["name"] in loopback["name"]:
                        default_speakers = loopback
                        break
                else:
                    print("[ERROR] No loopback device found.")
        
        source = sr.Microphone(speaker=True,
                               device_index= default_speakers["index"],
                               sample_rate=int(default_speakers["defaultSampleRate"]),
                               chunk_size=pyaudio.get_sample_size(pyaudio.paInt16),
                               channels=default_speakers["maxInputChannels"])
        super().__init__(source=source)
        self.adjust_for_noise("Default Speaker", "Please make or play some noise from the Default Speaker...")