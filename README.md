# 🎧 audio-transcription-module

audio-transcription-module is a live transcription tool that provides real-time transcripts for both the user's microphone input (You) and the user's speakers output (Speaker) saved to text files in a `transcripts` folder.

## 📖 Description

audio-transcription-module is designed to help users in their conversations by providing live transcriptions. Instead of displaying transcripts in a UI, it now saves them to timestamped text files in the `transcripts` folder, which are updated in real-time as the conversation progresses.

## 🚀 Getting Started

Follow these steps to set up and run audio-transcription-module on your local machine.

### 📋 Prerequisites

- Python >=3.8.0
- (Optional) An OpenAI API key that can access Whisper API (set up a paid account OpenAI account)
- Windows OS (Not tested on others)
- FFmpeg 

If FFmpeg is not installed in your system, you can follow the steps below to install it.

First, you need to install Chocolatey, a package manager for Windows. Open your PowerShell as Administrator and run the following command:
```
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```
Once Chocolatey is installed, you can install FFmpeg by running the following command in your PowerShell:
```
choco install ffmpeg
```
Please ensure that you run these commands in a PowerShell window with administrator privileges. If you face any issues during the installation, you can visit the official Chocolatey and FFmpeg websites for troubleshooting.

### 🔧 Installation

1. Clone the repository:

   ```
   git clone https://github.com/SevaSk/audio-transcription-module
   ```

2. Navigate to the `audio-transcription-module` folder:

   ```
   cd audio-transcription-module
   ```

3. Install the required packages:

   ```
   pip install -r requirements.txt
   ```
   
4. (Optional) Create a `keys.py` file in the audio-transcription-module directory and add your OpenAI API key:

   - Option 1: You can utilize a command on your command prompt. Run the following command, ensuring to replace "API KEY" with your actual OpenAI API key:

      ```
      python -c "with open('keys.py', 'w', encoding='utf-8') as f: f.write('OPENAI_API_KEY=\"API KEY\"')"
      ```

   - Option 2: You can create the keys.py file manually. Open up your text editor of choice and enter the following content:
   
      ```
      OPENAI_API_KEY="API KEY"
      ```
      Replace "API KEY" with your actual OpenAI API key. Save this file as keys.py within the audio-transcription-module directory.

### 🎬 Running audio-transcription-module

Run the main script:

```
python main.py
```

For a more better and faster version that also works with most languages, use:

```
python main.py --api
```

Upon initiation, audio-transcription-module will begin transcribing your microphone input and speaker output in real-time. The transcripts are saved to timestamped text files in the `transcripts` folder. Each new session creates a new transcript file.

The --api flag will use the whisper api for transcriptions. This significantly enhances transcription speed and accuracy, and it works in most languages (rather than just English without the flag). It's expected to become the default option in future releases. However, keep in mind that using the Whisper API will consume more OpenAI credits than using the local model. This increased cost is attributed to the advanced features and capabilities that the Whisper API provides. Despite the additional expense, the substantial improvements in speed and transcription accuracy may make it a worthwhile investment for your use case.

### ⚠️ Limitations

While audio-transcription-module provides real-time transcription, there are several known limitations to its functionality that you should be aware of:

**Default Mic and Speaker:** audio-transcription-module is currently configured to listen only to the default microphone and speaker set in your system. It will not detect sound from other devices or systems. If you wish to use a different mic or speaker, you will need to set it as your default device in your system settings.

**Whisper Model**: If the --api flag is not used, we utilize the 'tiny' version of the Whisper ASR model, due to its low resource consumption and fast response times. However, this model may not be as accurate as the larger models in transcribing certain types of speech, including accents or uncommon words.

**Language**: If you are not using the --api flag the Whisper model used in audio-transcription-module is set to English. As a result, it may not accurately transcribe non-English languages or dialects. We are actively working to add multi-language support to future versions of the program.

## 📖 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to improve audio-transcription-module.
