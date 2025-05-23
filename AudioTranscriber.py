import wave
import os
import threading
import tempfile
import custom_speech_recognition as sr
import io
from datetime import timedelta, datetime
try:
    import pyaudiowpatch as pyaudio
except ImportError:
    # Fallback to standard pyaudio if pyaudiowpatch is not available
    import pyaudio
from heapq import merge

PHRASE_TIMEOUT = 3.05
MAX_PHRASES = 10

class AudioTranscriber:
    def __init__(self, mic_source, speaker_source, model, transcript_dir='transcripts'):
        self.transcript_data = {"You": [], "Speaker": []}
        self.transcript_changed_event = threading.Event()
        self.audio_model = model
        
        # Determine the correct transcript directory path
        # In development, use src/transcripts/, in production use appropriate path
        if os.path.exists(os.path.join('..', 'src', 'transcripts')):
            # Development environment - audio module is run from audio-transcription-module/
            self.transcript_dir = os.path.join('..', 'src', 'transcripts')
        elif os.path.exists(os.path.join('src', 'transcripts')):
            # Alternative development setup
            self.transcript_dir = os.path.join('src', 'transcripts')
        else:
            # Use the provided transcript_dir parameter (fallback)
            self.transcript_dir = transcript_dir
        
        # Ensure transcript directory exists
        if not os.path.exists(self.transcript_dir):
            try:
                os.makedirs(self.transcript_dir, exist_ok=True)
                print(f"[INFO] Created transcript directory: {self.transcript_dir}")
            except Exception as e:
                print(f"[WARN] Could not create transcript directory {self.transcript_dir}: {e}")
                # Fallback to current directory
                self.transcript_dir = 'transcripts'
                if not os.path.exists(self.transcript_dir):
                    os.makedirs(self.transcript_dir, exist_ok=True)
                
        self.transcript_file = None
        self.transcript_file_path = None
        
        # Create a new transcript file with timestamp
        self.create_new_transcript_file()
        
        self.audio_sources = {
            "You": {
                "sample_rate": mic_source.SAMPLE_RATE,
                "sample_width": mic_source.SAMPLE_WIDTH,
                "channels": mic_source.channels,
                "last_sample": bytes(),
                "last_spoken": None,
                "new_phrase": True,
                "process_data_func": self.process_mic_data
            },
            "Speaker": {
                "sample_rate": speaker_source.SAMPLE_RATE,
                "sample_width": speaker_source.SAMPLE_WIDTH,
                "channels": speaker_source.channels,
                "last_sample": bytes(),
                "last_spoken": None,
                "new_phrase": True,
                "process_data_func": self.process_speaker_data
            }
        }

    def create_new_transcript_file(self):
        """Create a new transcript file with timestamp in the filename"""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        self.transcript_file_path = os.path.join(self.transcript_dir, f"transcript_{timestamp}.txt")
        print(f"Saving transcript to: {self.transcript_file_path}")
        
        # Create an empty file
        with open(self.transcript_file_path, 'w') as f:
            f.write("Transcript started at " + datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S") + " UTC\n\n")

    def transcribe_audio_queue(self, speaker_queue, mic_queue):
        import queue
        
        while True:
            pending_transcriptions = []
            
            mic_data = []
            while True:
                try:
                    data, time_spoken = mic_queue.get_nowait()
                    self.update_last_sample_and_phrase_status("You", data, time_spoken)
                    mic_data.append((data, time_spoken))
                except queue.Empty:
                    break
                    
            speaker_data = []
            while True:
                try:
                    data, time_spoken = speaker_queue.get_nowait()
                    self.update_last_sample_and_phrase_status("Speaker", data, time_spoken)
                    speaker_data.append((data, time_spoken))
                except queue.Empty:
                    break
            
            if mic_data:
                source_info = self.audio_sources["You"]
                try:
                    fd, path = tempfile.mkstemp(suffix=".wav")
                    os.close(fd)
                    source_info["process_data_func"](source_info["last_sample"], path)
                    text = self.audio_model.get_transcription(path)
                    if text != '' and text.lower() != 'you':
                        latest_time = max(time for _, time in mic_data)
                        # Convert to UTC
                        utc_time = datetime.utcnow()
                        pending_transcriptions.append(("You", text, utc_time))
                except Exception as e:
                    print(f"Transcription error for You: {e}")
                finally:
                    os.unlink(path)
            
            if speaker_data:
                source_info = self.audio_sources["Speaker"]
                try:
                    fd, path = tempfile.mkstemp(suffix=".wav")
                    os.close(fd)
                    source_info["process_data_func"](source_info["last_sample"], path)
                    text = self.audio_model.get_transcription(path)
                    if text != '' and text.lower() != 'you':
                        latest_time = max(time for _, time in speaker_data)
                        # Convert to UTC
                        utc_time = datetime.utcnow()
                        pending_transcriptions.append(("Speaker", text, utc_time))
                except Exception as e:
                    print(f"Transcription error for Speaker: {e}")
                finally:
                    os.unlink(path)
            
            if pending_transcriptions:
                pending_transcriptions.sort(key=lambda x: x[2])
                for who_spoke, text, time_spoken in pending_transcriptions:
                    self.update_transcript(who_spoke, text, time_spoken)
                
                self.transcript_changed_event.set()
                # Write the transcript to file
                self.write_transcript_to_file()
            
            threading.Event().wait(0.1)

    def update_last_sample_and_phrase_status(self, who_spoke, data, time_spoken):
        source_info = self.audio_sources[who_spoke]
        if source_info["last_spoken"] and time_spoken - source_info["last_spoken"] > timedelta(seconds=PHRASE_TIMEOUT):
            source_info["last_sample"] = bytes()
            source_info["new_phrase"] = True
        else:
            source_info["new_phrase"] = False

        source_info["last_sample"] += data
        source_info["last_spoken"] = time_spoken 

    def process_mic_data(self, data, temp_file_name):
        audio_data = sr.AudioData(data, self.audio_sources["You"]["sample_rate"], self.audio_sources["You"]["sample_width"])
        wav_data = io.BytesIO(audio_data.get_wav_data())
        with open(temp_file_name, 'w+b') as f:
            f.write(wav_data.read())

    def process_speaker_data(self, data, temp_file_name):
        with wave.open(temp_file_name, 'wb') as wf:
            wf.setnchannels(self.audio_sources["Speaker"]["channels"])
            p = pyaudio.PyAudio()
            wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
            wf.setframerate(self.audio_sources["Speaker"]["sample_rate"])
            wf.writeframes(data)

    def update_transcript(self, who_spoke, text, time_spoken):
        source_info = self.audio_sources[who_spoke]
        transcript = self.transcript_data[who_spoke]
        
        # Format timestamp for display using same format as header
        timestamp_str = time_spoken.strftime("%Y-%m-%d %H:%M:%S")
        
        if source_info["new_phrase"] or len(transcript) == 0:
            if len(transcript) > MAX_PHRASES:
                transcript.pop(-1)
            transcript.insert(0, (f"{who_spoke}[{timestamp_str}]: [{text}]\n\n", time_spoken))
        else:
            transcript[0] = (f"{who_spoke}[{timestamp_str}]: [{text}]\n\n", time_spoken)

    def get_transcript(self):
        combined_transcript = list(merge(
            self.transcript_data["You"], self.transcript_data["Speaker"], 
            key=lambda x: x[1], reverse=True))
        combined_transcript = combined_transcript[:MAX_PHRASES]
        return "".join([t[0] for t in combined_transcript])
    
    def clear_transcript_data(self):
        self.transcript_data["You"].clear()
        self.transcript_data["Speaker"].clear()

        self.audio_sources["You"]["last_sample"] = bytes()
        self.audio_sources["Speaker"]["last_sample"] = bytes()

        self.audio_sources["You"]["new_phrase"] = True
        self.audio_sources["Speaker"]["new_phrase"] = True
        
        # Create a new transcript file
        self.create_new_transcript_file()
    
    def write_transcript_to_file(self):
        """Write the current transcript to the file"""
        if self.transcript_file_path:
            with open(self.transcript_file_path, 'w') as f:
                f.write("Transcript updated at " + datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S") + " UTC\n\n")
                f.write(self.get_transcript())