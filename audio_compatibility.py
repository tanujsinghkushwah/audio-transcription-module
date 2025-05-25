#!/usr/bin/env python3
"""
Audio Compatibility Module for Interview Genie
Provides cross-platform audio recording with multiple backend support
"""

import sys
import platform
import logging
import threading
import time
from datetime import datetime
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioBackend:
    """Base class for audio backends"""
    
    def __init__(self):
        self.is_available = False
        self.name = "Base"
        
    def test_availability(self):
        """Test if this backend is available"""
        return False
        
    def create_microphone(self, device_index=None, sample_rate=16000):
        """Create a microphone source"""
        raise NotImplementedError
        
    def create_speaker_monitor(self, device_index=None):
        """Create a speaker monitoring source"""
        raise NotImplementedError

class PyAudioBackend(AudioBackend):
    """Standard PyAudio backend"""
    
    def __init__(self):
        super().__init__()
        self.name = "PyAudio"
        self.pyaudio = None
        
    def test_availability(self):
        try:
            import pyaudio
            self.pyaudio = pyaudio
            
            # Test basic functionality
            p = pyaudio.PyAudio()
            try:
                # Try to get device count
                device_count = p.get_device_count()
                logger.info(f"PyAudio: Found {device_count} audio devices")
                
                # Try to get default input device
                default_input = p.get_default_input_device_info()
                logger.info(f"PyAudio: Default input device: {default_input['name']}")
                
                self.is_available = True
                return True
                
            except Exception as e:
                logger.error(f"PyAudio test failed: {e}")
                return False
            finally:
                p.terminate()
                
        except ImportError as e:
            logger.warning(f"PyAudio not available: {e}")
            return False
        except Exception as e:
            logger.error(f"PyAudio backend error: {e}")
            return False
    
    def create_microphone(self, device_index=None, sample_rate=16000):
        if not self.is_available:
            raise RuntimeError("PyAudio backend not available")
            
        import custom_speech_recognition as sr
        return sr.Microphone(device_index=device_index, sample_rate=sample_rate)

class PyAudioWPatchBackend(AudioBackend):
    """PyAudioWPatch backend for Windows"""
    
    def __init__(self):
        super().__init__()
        self.name = "PyAudioWPatch"
        self.pyaudio = None
        
    def test_availability(self):
        try:
            import pyaudiowpatch as pyaudio
            self.pyaudio = pyaudio
            
            # Test basic functionality
            p = pyaudio.PyAudio()
            try:
                device_count = p.get_device_count()
                logger.info(f"PyAudioWPatch: Found {device_count} audio devices")
                
                # Check for WASAPI loopback devices (Windows speaker monitoring)
                wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
                logger.info(f"PyAudioWPatch: WASAPI available with {wasapi_info['deviceCount']} devices")
                
                self.is_available = True
                return True
                
            except Exception as e:
                logger.error(f"PyAudioWPatch test failed: {e}")
                return False
            finally:
                p.terminate()
                
        except ImportError as e:
            logger.warning(f"PyAudioWPatch not available: {e}")
            return False
        except Exception as e:
            logger.error(f"PyAudioWPatch backend error: {e}")
            return False

class SoundDeviceBackend(AudioBackend):
    """SoundDevice backend as fallback"""
    
    def __init__(self):
        super().__init__()
        self.name = "SoundDevice"
        
    def test_availability(self):
        try:
            import sounddevice as sd
            
            # Test basic functionality
            devices = sd.query_devices()
            logger.info(f"SoundDevice: Found {len(devices)} audio devices")
            
            # Test default input device
            default_input = sd.query_devices(kind='input')
            logger.info(f"SoundDevice: Default input device: {default_input['name']}")
            
            self.is_available = True
            return True
            
        except ImportError as e:
            logger.warning(f"SoundDevice not available: {e}")
            return False
        except Exception as e:
            logger.error(f"SoundDevice backend error: {e}")
            return False

class AudioCompatibilityManager:
    """Manages audio backend selection and fallbacks"""
    
    def __init__(self):
        self.backends = []
        self.active_backend = None
        self.platform = platform.system()
        
        # Initialize backends in order of preference
        if self.platform == "Windows":
            self.backends = [
                PyAudioWPatchBackend(),
                PyAudioBackend(),
                SoundDeviceBackend()
            ]
        elif self.platform == "Darwin":  # macOS
            self.backends = [
                SoundDeviceBackend(),  # Try SoundDevice first on macOS
                PyAudioBackend(),
                PyAudioWPatchBackend()
            ]
        else:  # Linux
            self.backends = [
                PyAudioBackend(),
                SoundDeviceBackend(),
                PyAudioWPatchBackend()
            ]
    
    def initialize(self):
        """Initialize and select the best available backend"""
        logger.info(f"Initializing audio backends for {self.platform}")
        
        for backend in self.backends:
            logger.info(f"Testing {backend.name} backend...")
            
            try:
                if backend.test_availability():
                    logger.info(f"✅ {backend.name} backend is available")
                    self.active_backend = backend
                    return True
                else:
                    logger.warning(f"❌ {backend.name} backend not available")
            except Exception as e:
                logger.error(f"❌ {backend.name} backend failed: {e}")
        
        logger.error("No audio backends available!")
        return False
    
    def get_microphone(self, device_index=None, sample_rate=16000):
        """Get a microphone using the active backend"""
        if not self.active_backend:
            raise RuntimeError("No audio backend available")
        
        return self.active_backend.create_microphone(device_index, sample_rate)
    
    def get_backend_name(self):
        """Get the name of the active backend"""
        return self.active_backend.name if self.active_backend else "None"

# Global instance
audio_manager = AudioCompatibilityManager()

def check_audio_compatibility():
    """Check audio compatibility and return status"""
    try:
        success = audio_manager.initialize()
        
        if success:
            backend_name = audio_manager.get_backend_name()
            logger.info(f"✅ Audio system initialized using {backend_name}")
            
            # Create a status file
            status = {
                "available": True,
                "backend": backend_name,
                "platform": platform.system(),
                "timestamp": datetime.now().isoformat()
            }
            
            # Save status to file
            status_file = os.path.join(os.path.dirname(__file__), 'audio_status.json')
            import json
            with open(status_file, 'w') as f:
                json.dump(status, f, indent=2)
            
            return True
        else:
            logger.error("❌ No audio backends available")
            
            # Create a failure status file
            status = {
                "available": False,
                "backend": None,
                "platform": platform.system(),
                "timestamp": datetime.now().isoformat(),
                "error": "No audio backends available"
            }
            
            status_file = os.path.join(os.path.dirname(__file__), 'audio_status.json')
            import json
            with open(status_file, 'w') as f:
                json.dump(status, f, indent=2)
            
            return False
            
    except Exception as e:
        logger.error(f"Audio compatibility check failed: {e}")
        return False

if __name__ == "__main__":
    """Test audio compatibility when run directly"""
    print("🎧 Testing Audio Compatibility")
    print("=" * 50)
    
    success = check_audio_compatibility()
    
    if success:
        print(f"\n🎉 Audio system ready using {audio_manager.get_backend_name()}")
        sys.exit(0)
    else:
        print("\n💥 Audio system not available")
        sys.exit(1) 