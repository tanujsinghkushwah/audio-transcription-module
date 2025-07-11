/**
 * Audio Transcription Module - Main Entry Point
 * Similar to blockchain-payment-system integration pattern
 */

const AudioTranscriptionManager = require('./services/AudioTranscriptionManager');
const TranscriptProcessor = require('./services/TranscriptProcessor');
const path = require('path');
const fs = require('fs');

/**
 * Initialize and start the audio transcription system
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} System components
 */
async function startAudioTranscriptionSystem(options = {}) {
  try {
    console.log('Starting audio transcription system...');
    
    // Create the audio transcription manager
    const manager = new AudioTranscriptionManager(options);
    
    // Create the transcript processor
    const processor = new TranscriptProcessor();
    
    // Initialize the manager
    const initResult = await manager.initialize();
    if (!initResult.success) {
      throw new Error(`Failed to initialize audio manager: ${initResult.error}`);
    }
    
    // Start the transcription process
    const startResult = await manager.start();
    if (!startResult.success) {
      throw new Error(`Failed to start transcription: ${startResult.error}`);
    }
    
    // Connect processor to manager events
    manager.on('transcript.detected', (data) => {
      processor.processTranscript(data);
    });
    
    manager.on('transcription.error', (error) => {
      console.error('Transcription error:', error);
    });
    
    console.log('Audio transcription system started successfully');
    
    // Return the initialized components (similar to blockchain pattern)
    return {
      manager,
      processor,
      // Maintain compatibility with existing interface
      setTranscriptCallback: (callback) => manager.setTranscriptCallback(callback),
      setMicEnabled: (enabled) => manager.setMicEnabled(enabled),
      getCurrentTranscriptFile: () => manager.getCurrentTranscriptFile(),
      clearTranscripts: () => manager.clearTranscripts()
    };
  } catch (error) {
    console.error('Failed to start audio transcription system:', error);
    throw error;
  }
}

/**
 * Stop the audio transcription system
 * @param {Object} system - The system components to stop
 * @returns {Promise<boolean>} Success status
 */
async function stopAudioTranscriptionSystem(system) {
  try {
    console.log('Stopping audio transcription system...');
    
    if (system && system.manager) {
      await system.manager.stop();
    }
    
    console.log('Audio transcription system stopped successfully');
    return true;
  } catch (error) {
    console.error('Failed to stop audio transcription system:', error);
    return false;
  }
}

// If this file is run directly, start in standalone mode
if (require.main === module) {
  startAudioTranscriptionSystem()
    .then((system) => {
      console.log('Audio transcription system is ready');
      
      // Set up basic transcript callback for testing
      system.setTranscriptCallback((transcript) => {
        console.log('Transcript received:', transcript);
      });
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await stopAudioTranscriptionSystem(system);
        process.exit(0);
      });
    })
    .catch(error => {
      console.error('Failed to start audio transcription system:', error);
      process.exit(1);
    });
}

// Export the functions (similar to blockchain pattern)
module.exports = {
  startAudioTranscriptionSystem,
  stopAudioTranscriptionSystem
}; 