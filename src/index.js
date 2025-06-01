/**
 * Audio Transcription System - Main Entry Point
 * Following the blockchain payment system integration pattern
 */

const EventEmitter = require('events');
const AudioSystemManager = require('./AudioSystemManager');
const TranscriptMonitor = require('./TranscriptMonitor');
const DependencyManager = require('./utils/DependencyManager');
const PathManager = require('./utils/PathManager');

class AudioTranscriptionSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      transcriptDirectory: config.transcriptDirectory || 'transcripts',
      pythonPath: config.pythonPath || null,
      enableRealtime: config.enableRealtime !== false,
      micEnabled: config.micEnabled || false,
      debug: config.debug || false,
      ...config
    };
    
    this.pathManager = new PathManager(this.config);
    this.systemManager = new AudioSystemManager(this.config, this.pathManager);
    this.transcriptMonitor = new TranscriptMonitor(this.config, this.pathManager);
    this.dependencyManager = new DependencyManager(this.config, this.pathManager);
    this.isRunning = false;
    this.initialized = false;
  }

  /**
   * Initialize the audio transcription system
   */
  async initialize() {
    if (this.initialized) {
      console.log('Audio transcription system already initialized');
      return true;
    }

    try {
      console.log('Initializing audio transcription system...');
      
      // Step 1: Initialize path manager
      await this.pathManager.initialize();

      // Step 2: Check and setup dependencies
      const depsOk = await this.dependencyManager.ensureDependencies();
      if (!depsOk) {
        console.warn('Some dependencies may be missing, but continuing with initialization');
      }

      // Step 3: Initialize system manager
      await this.systemManager.initialize();

      // Step 4: Setup transcript monitoring
      await this.transcriptMonitor.initialize();
      
      // Step 5: Connect events
      this.setupEventHandlers();

      this.initialized = true;
      console.log('Audio transcription system initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize audio transcription system:', error);
      throw error;
    }
  }

  /**
   * Start the audio transcription system
   */
  async start() {
    if (this.isRunning) {
      console.log('Audio transcription system already running');
      return true;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log('Starting audio transcription system...');
      
      // Start the Python transcription process
      await this.systemManager.start();
      
      // Start transcript monitoring
      await this.transcriptMonitor.start();
      
      this.isRunning = true;
      console.log('Audio transcription system started successfully');
      
      // Emit ready event
      this.emit('ready');
      return true;
    } catch (error) {
      console.error('Failed to start audio transcription system:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the audio transcription system
   */
  async stop() {
    if (!this.isRunning) return;

    try {
      console.log('Stopping audio transcription system...');
      
      // Stop transcript monitoring first
      await this.transcriptMonitor.stop();
      
      // Stop the Python process
      await this.systemManager.stop();
      
      this.isRunning = false;
      console.log('Audio transcription system stopped');
      
      this.emit('stopped');
    } catch (error) {
      console.error('Error stopping audio transcription system:', error);
      this.emit('error', error);
    }
  }

  /**
   * Setup event handlers for internal components
   */
  setupEventHandlers() {
    // Forward transcript events
    this.transcriptMonitor.on('transcript', (data) => {
      this.emit('transcript', data);
    });

    this.transcriptMonitor.on('question', (data) => {
      this.emit('question', data);
    });

    this.transcriptMonitor.on('interimTranscript', (data) => {
      this.emit('interimTranscript', data);
    });

    // Forward system events
    this.systemManager.on('processStarted', () => {
      this.emit('processStarted');
    });

    this.systemManager.on('processError', (error) => {
      this.emit('processError', error);
    });

    this.systemManager.on('processStopped', (data) => {
      this.emit('processStopped', data);
    });

    this.systemManager.on('processOutput', (output) => {
      if (this.config.debug) {
        this.emit('processOutput', output);
      }
    });
  }

  /**
   * Enable/disable microphone
   */
  setMicEnabled(enabled) {
    this.config.micEnabled = enabled;
    return this.systemManager.setMicEnabled(enabled);
  }

  /**
   * Clear existing transcripts
   */
  async clearTranscripts() {
    return this.transcriptMonitor.clearTranscripts();
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      running: this.isRunning,
      micEnabled: this.config.micEnabled,
      pythonProcess: this.systemManager.getProcessInfo(),
      transcriptDirectory: this.transcriptMonitor.getTranscriptDirectory(),
      paths: this.pathManager.getAllPaths()
    };
  }

  /**
   * Get latest transcripts (for compatibility with existing code)
   */
  getLatestTranscripts() {
    return this.transcriptMonitor.getLatestTranscripts();
  }
}

/**
 * Main entry function (like blockchain system)
 */
async function startAudioTranscriptionSystem(config = {}) {
  try {
    console.log('Starting audio transcription system...');
    
    const system = new AudioTranscriptionSystem(config);
    await system.start();
    
    console.log('Audio transcription system is ready');
    
    return {
      system,
      manager: system.systemManager,
      monitor: system.transcriptMonitor,
      pathManager: system.pathManager
    };
  } catch (error) {
    console.error('Failed to start audio transcription system:', error);
    throw error;
  }
}

// Export like blockchain system
module.exports = {
  startAudioTranscriptionSystem,
  AudioTranscriptionSystem
}; 