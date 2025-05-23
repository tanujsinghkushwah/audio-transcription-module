import custom_speech_recognition as sr
try:
    import pyaudiowpatch as pyaudio
except ImportError:
    # Fallback to standard pyaudio if pyaudiowpatch is not available
    import pyaudio
from datetime import datetime
import threading
import time
import sys
import os

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
        try:
            # Try to initialize speaker recording - this may not work on all platforms
            p = pyaudio.PyAudio()
            speaker_source = None
            
            try:
                # Check if WASAPI is available (Windows-specific)
                if hasattr(pyaudio, 'paWASAPI'):
                    wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
                    default_speakers = p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
                    
                    if not default_speakers["isLoopbackDevice"]:
                        # Look for loopback device
                        if hasattr(p, 'get_loopback_device_info_generator'):
                            for loopback in p.get_loopback_device_info_generator():
                                if default_speakers["name"] in loopback["name"]:
                                    default_speakers = loopback
                                    break
                            else:
                                print("[ERROR] No loopback device found.")
                                raise Exception("No loopback device available")
                        else:
                            print("[ERROR] Loopback device generator not available.")
                            raise Exception("Loopback not supported")
                    
                    speaker_source = sr.Microphone(speaker=True,
                                           device_index=default_speakers["index"],
                                           sample_rate=int(default_speakers["defaultSampleRate"]),
                                           chunk_size=pyaudio.get_sample_size(pyaudio.paInt16),
                                           channels=default_speakers["maxInputChannels"])
                elif sys.platform == 'darwin':  # macOS
                    print("[INFO] Attempting macOS speaker recording")
                    # On macOS, look for virtual audio devices like BlackHole or Soundflower
                    devices = []
                    found_virtual_device = False
                    
                    for i in range(p.get_device_count()):
                        device_info = p.get_device_info_by_index(i)
                        devices.append(device_info)
                        device_name_lower = device_info["name"].lower()
                        
                        # Look for virtual audio devices commonly used for speaker recording
                        if any(keyword in device_name_lower for keyword in 
                               ["blackhole", "soundflower", "loopback", "virtual", "aggregate"]):
                            print(f"[INFO] Found virtual audio device: {device_info['name']}")
                            try:
                                speaker_source = sr.Microphone(
                                    device_index=i,
                                    sample_rate=int(device_info["defaultSampleRate"]) if device_info["defaultSampleRate"] > 0 else 44100,
                                    chunk_size=1024
                                )
                                found_virtual_device = True
                                print(f"[SUCCESS] Successfully configured virtual device: {device_info['name']}")
                                break
                            except Exception as virtual_error:
                                print(f"[WARN] Failed to configure virtual device {device_info['name']}: {virtual_error}")
                                continue
                    
                    # If no virtual device found, provide clear instructions
                    if not found_virtual_device:
                        print("[WARN] No virtual audio device found on macOS!")
                        print("[INFO] For speaker recording on macOS, please install one of:")
                        print("      1. BlackHole: https://github.com/ExistentialAudio/BlackHole")
                        print("      2. Soundflower: https://github.com/mattingalls/Soundflower")
                        print("      3. Create an Aggregate Device in Audio MIDI Setup")
                        print("[INFO] Using fallback configuration - speaker audio may not be captured properly")
                        
                        # Create a fallback microphone instance with different settings
                        # This won't capture speaker audio but will prevent crashes
                        speaker_source = sr.Microphone(sample_rate=44100, chunk_size=2048)
                        print("[INFO] Created fallback speaker source (will not capture system audio)")
                else:
                    # Linux or other platforms
                    print("[INFO] WASAPI not available, using PulseAudio or ALSA for speaker recording")
                    # Try to find a monitor device (Linux PulseAudio)
                    for i in range(p.get_device_count()):
                        device_info = p.get_device_info_by_index(i)
                        if "monitor" in device_info["name"].lower() or \
                           "speakers" in device_info["name"].lower():
                            print(f"[INFO] Using monitor device: {device_info['name']}")
                            speaker_source = sr.Microphone(
                                device_index=i,
                                sample_rate=int(device_info["defaultSampleRate"]),
                                chunk_size=1024
                            )
                            break
                    
                    if speaker_source is None:
                        print("[INFO] No monitor device found, using default input")
                        speaker_source = sr.Microphone(sample_rate=16000)
                    
            finally:
                p.terminate()
                
        except Exception as e:
            print(f"[WARN] Speaker recording initialization failed: {e}")
            print("[INFO] Creating fallback speaker source")
            # Create a fallback speaker source with different parameters than microphone
            speaker_source = sr.Microphone(sample_rate=44100, chunk_size=2048)
        
        if speaker_source is None:
            print("[ERROR] Failed to create any speaker source, using basic microphone")
            speaker_source = sr.Microphone(sample_rate=16000)
        
        super().__init__(source=speaker_source)
        
        # Use a significantly higher energy threshold for speaker recording to differentiate from mic
        # This helps ensure that only louder sounds (like from speakers/calls) trigger speaker recording
        self.recorder.energy_threshold = ENERGY_THRESHOLD * 2.5
        
        self.adjust_for_noise("Default Speaker", "Please make or play some noise from the Default Speaker...")