#!/usr/bin/env python3

import custom_speech_recognition as sr
import time

def test_mic_energy():
    print("=== Testing Microphone Energy Levels ===")
    
    # Create recognizer and microphone
    r = sr.Recognizer()
    mic = sr.Microphone(sample_rate=16000)
    
    print(f"Default energy threshold: {r.energy_threshold}")
    print(f"Dynamic energy threshold: {r.dynamic_energy_threshold}")
    
    # Test ambient noise adjustment
    print("\nAdjusting for ambient noise (please stay quiet for 2 seconds)...")
    with mic as source:
        r.adjust_for_ambient_noise(source, duration=2)
    
    print(f"Energy threshold after ambient adjustment: {r.energy_threshold}")
    
    # Test listening for speech
    print("\nListening for speech (speak something)...")
    print("Will listen for 10 seconds and show energy levels...")
    
    def callback(recognizer, audio):
        try:
            # Get the raw audio data
            raw_data = audio.get_raw_data()
            print(f"Audio detected! Data length: {len(raw_data)} bytes")
            print(f"Current energy threshold: {recognizer.energy_threshold}")
            
            # Try to recognize
            try:
                text = recognizer.recognize_whisper(audio, model="base")
                print(f"Recognized: '{text}'")
            except sr.UnknownValueError:
                print("Could not understand audio")
            except sr.RequestError as e:
                print(f"Error with recognition: {e}")
        except Exception as e:
            print(f"Error in callback: {e}")
    
    # Start listening in background
    stop_listening = r.listen_in_background(mic, callback, phrase_time_limit=3)
    
    # Let it listen for 10 seconds
    time.sleep(10)
    
    # Stop listening
    stop_listening(wait_for_stop=False)
    print("\nTest completed!")

if __name__ == "__main__":
    test_mic_energy() 