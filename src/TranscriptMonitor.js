/**
 * Transcript Monitor - Monitors transcript files and emits events
 * Provides real-time monitoring of Python-generated transcript files
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class TranscriptMonitor extends EventEmitter {
  constructor(config, pathManager) {
    super();
    this.config = config;
    this.pathManager = pathManager;
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.lastFileContent = '';
    this.lastFileSize = 0;
    this.currentTranscriptFile = null;
    this.processedEntries = new Map();
    this.lastProcessedTime = 0;
  }

  /**
   * Initialize the transcript monitor
   */
  async initialize() {
    try {
      console.log('Initializing TranscriptMonitor...');
      
      // Ensure transcript directory exists
      const transcriptDir = this.pathManager.getTranscriptDirectory();
      if (!fs.existsSync(transcriptDir)) {
        fs.mkdirSync(transcriptDir, { recursive: true });
        console.log(`Created transcript directory: ${transcriptDir}`);
      }
      
      console.log('TranscriptMonitor initialized successfully');
      return true;
    } catch (error) {
      console.error('TranscriptMonitor initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start monitoring transcript files
   */
  async start() {
    if (this.isMonitoring) {
      console.log('TranscriptMonitor already running');
      return;
    }

    try {
      console.log('Starting transcript monitoring...');
      
      this.isMonitoring = true;
      
      // Start the monitoring loop
      this.monitorInterval = setInterval(() => {
        this.checkForTranscripts();
      }, this.config.monitorInterval || 500);
      
      console.log('Transcript monitoring started');
      return true;
    } catch (error) {
      console.error('Failed to start transcript monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring transcript files
   */
  async stop() {
    if (!this.isMonitoring) {
      console.log('TranscriptMonitor not running');
      return;
    }

    try {
      console.log('Stopping transcript monitoring...');
      
      this.isMonitoring = false;
      
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
      
      console.log('Transcript monitoring stopped');
    } catch (error) {
      console.error('Error stopping transcript monitoring:', error);
      throw error;
    }
  }

  /**
   * Check for new or updated transcript files
   */
  checkForTranscripts() {
    try {
      const transcriptDir = this.pathManager.getTranscriptDirectory();
      
      if (!fs.existsSync(transcriptDir)) {
        return;
      }

      // Get all transcript files
      const files = fs.readdirSync(transcriptDir)
        .filter(file => /^transcript_\d+_\d+\.txt$/.test(file))
        .sort()
        .reverse(); // newest first

      if (files.length === 0) {
        return;
      }

      // Monitor the most recent file
      const latestFile = path.join(transcriptDir, files[0]);
      
      // If we're monitoring a different file, switch to the new one
      if (this.currentTranscriptFile !== latestFile) {
        console.log(`Switching to monitor file: ${latestFile}`);
        this.currentTranscriptFile = latestFile;
        this.lastFileContent = '';
        this.lastFileSize = 0;
      }

      // Check if file has been updated
      this.checkFileUpdates(latestFile);
    } catch (error) {
      console.error('Error checking transcripts:', error);
    }
  }

  /**
   * Check for updates in a specific transcript file
   */
  checkFileUpdates(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }

      const stats = fs.statSync(filePath);
      const currentSize = stats.size;

      // Only process if file size has changed
      if (currentSize === this.lastFileSize) {
        return;
      }

      // Read file content
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Only process if content has actually changed
      if (content === this.lastFileContent) {
        this.lastFileSize = currentSize;
        return;
      }

      // Process new content
      this.processTranscriptContent(content, filePath);
      
      this.lastFileContent = content;
      this.lastFileSize = currentSize;
    } catch (error) {
      console.error('Error checking file updates:', error);
    }
  }

  /**
   * Process transcript content and emit events
   */
  processTranscriptContent(content, filePath) {
    try {
      // Extract all speaker entries (You and Speaker)
      const youMatches = [...content.matchAll(/You\[([^\]]+)\]:\s*\[([^\]]+)\]/g)];
      const speakerMatches = [...content.matchAll(/Speaker\[([^\]]+)\]:\s*\[([^\]]+)\]/g)];
      
      // Combine all matches
      const allMatches = [...youMatches, ...speakerMatches];
      
      if (allMatches.length === 0) {
        return;
      }

      // Process each match
      for (const match of allMatches) {
        if (match.length < 3) continue;
        
        const speaker = match[0].startsWith('You') ? 'You' : 'Speaker';
        const timestampStr = match[1].trim();
        const text = match[2].trim();
        
        if (!text || text.length === 0) continue;
        
        // Create unique key for deduplication
        const entryKey = `${speaker}:${timestampStr}:${text}`;
        
        // Skip if already processed
        if (this.processedEntries.has(entryKey)) {
          continue;
        }
        
        // Mark as processed
        this.processedEntries.set(entryKey, Date.now());
        
        // Create transcript data
        const transcriptData = {
          speaker: speaker,
          text: text,
          timestamp: timestampStr,
          isFinal: true,
          source: 'audio-module',
          filePath: filePath
        };
        
        // Emit transcript event
        this.emit('transcript', transcriptData);
        
        // Check if this looks like a question and emit question event
        if (this.isQuestion(text)) {
          this.emit('question', {
            ...transcriptData,
            type: 'question'
          });
        }
        
        // For "You" entries, also emit as interim for real-time updates
        if (speaker === 'You') {
          this.emit('interimTranscript', {
            ...transcriptData,
            isFinal: false
          });
        }
      }
      
      // Clean up old processed entries (keep only last 5 minutes)
      this.cleanupProcessedEntries();
    } catch (error) {
      console.error('Error processing transcript content:', error);
    }
  }

  /**
   * Check if text appears to be a question
   */
  isQuestion(text) {
    const lowerText = text.toLowerCase().trim();
    
    // Check for question words at the beginning
    const questionWords = [
      'what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose',
      'can you', 'could you', 'would you', 'will you', 'do you', 'did you',
      'have you', 'are you', 'is there', 'are there', 'tell me', 'explain'
    ];
    
    const startsWithQuestion = questionWords.some(word => 
      lowerText.startsWith(word)
    );
    
    // Check for question mark
    const hasQuestionMark = text.includes('?');
    
    // Check for typical interview question patterns
    const interviewPatterns = [
      'describe', 'experience with', 'strength', 'weakness', 'challenge',
      'project', 'example of', 'time when', 'situation where'
    ];
    
    const hasInterviewPattern = interviewPatterns.some(pattern =>
      lowerText.includes(pattern)
    );
    
    return startsWithQuestion || hasQuestionMark || hasInterviewPattern;
  }

  /**
   * Clean up old processed entries to prevent memory leaks
   */
  cleanupProcessedEntries() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    for (const [key, timestamp] of this.processedEntries.entries()) {
      if (timestamp < fiveMinutesAgo) {
        this.processedEntries.delete(key);
      }
    }
  }

  /**
   * Clear existing transcript files
   */
  async clearTranscripts() {
    try {
      const transcriptDir = this.pathManager.getTranscriptDirectory();
      
      if (!fs.existsSync(transcriptDir)) {
        return true;
      }
      
      const files = fs.readdirSync(transcriptDir);
      const transcriptFiles = files.filter(file => 
        file.startsWith('transcript_') && file.endsWith('.txt')
      );
      
      let deletedCount = 0;
      for (const file of transcriptFiles) {
        try {
          const filePath = path.join(transcriptDir, file);
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (deleteError) {
          console.error(`Error deleting transcript file ${file}:`, deleteError);
        }
      }
      
      console.log(`Cleared ${deletedCount} transcript files`);
      
      // Reset monitoring state
      this.currentTranscriptFile = null;
      this.lastFileContent = '';
      this.lastFileSize = 0;
      this.processedEntries.clear();
      
      return true;
    } catch (error) {
      console.error('Error clearing transcripts:', error);
      return false;
    }
  }

  /**
   * Get latest transcripts (for compatibility)
   */
  getLatestTranscripts() {
    try {
      const transcriptDir = this.pathManager.getTranscriptDirectory();
      
      if (!fs.existsSync(transcriptDir)) {
        return [];
      }
      
      const files = fs.readdirSync(transcriptDir)
        .filter(file => /^transcript_\d+_\d+\.txt$/.test(file))
        .sort()
        .reverse();
      
      if (files.length === 0) {
        return [];
      }
      
      // Read the most recent file
      const latestFile = path.join(transcriptDir, files[0]);
      const content = fs.readFileSync(latestFile, 'utf8');
      
      // Extract recent entries
      const youMatches = [...content.matchAll(/You\[([^\]]+)\]:\s*\[([^\]]+)\]/g)];
      const speakerMatches = [...content.matchAll(/Speaker\[([^\]]+)\]:\s*\[([^\]]+)\]/g)];
      
      const allEntries = [];
      
      // Process You entries
      for (const match of youMatches) {
        if (match.length >= 3) {
          allEntries.push({
            speaker: 'You',
            timestamp: match[1].trim(),
            text: match[2].trim(),
            type: 'you'
          });
        }
      }
      
      // Process Speaker entries
      for (const match of speakerMatches) {
        if (match.length >= 3) {
          allEntries.push({
            speaker: 'Speaker',
            timestamp: match[1].trim(),
            text: match[2].trim(),
            type: 'speaker'
          });
        }
      }
      
      // Sort by timestamp and return most recent
      return allEntries
        .filter(entry => entry.text && entry.text.length > 0)
        .slice(-10); // Return last 10 entries
    } catch (error) {
      console.error('Error getting latest transcripts:', error);
      return [];
    }
  }

  /**
   * Get transcript directory path
   */
  getTranscriptDirectory() {
    return this.pathManager.getTranscriptDirectory();
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      currentFile: this.currentTranscriptFile,
      processedEntries: this.processedEntries.size,
      lastFileSize: this.lastFileSize,
      transcriptDirectory: this.getTranscriptDirectory()
    };
  }
}

module.exports = TranscriptMonitor; 