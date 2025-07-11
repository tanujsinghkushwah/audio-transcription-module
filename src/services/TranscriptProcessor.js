/**
 * Transcript Processor
 * Handles processing and formatting of transcript data
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class TranscriptProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableConversationLogging: options.enableConversationLogging !== false,
      conversationDir: options.conversationDir || this.getConversationDirectory(),
      ...options
    };
    
    this.currentSession = null;
    this.conversationHistory = [];
  }

  /**
   * Get conversation directory
   */
  getConversationDirectory() {
    try {
      const { app } = require('electron');
      const isPackaged = app && app.isPackaged;
      
      if (isPackaged) {
        return path.join(app.getPath('userData'), 'src', 'transcripts');
      } else {
        return path.join(process.cwd(), 'src', 'transcripts');
      }
    } catch (error) {
      // Fallback for non-electron environments
      return path.join(__dirname, '..', '..', '..', 'src', 'transcripts');
    }
  }

  /**
   * Process a transcript from the audio system
   * @param {Object} transcriptData - Raw transcript data
   */
  processTranscript(transcriptData) {
    try {
      if (!transcriptData || !transcriptData.content) return;

      // Parse the content for transcript lines
      const lines = transcriptData.content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const parsedTranscript = this.parseTranscriptLine(line);
        if (parsedTranscript) {
          this.handleParsedTranscript(parsedTranscript);
        }
      }
    } catch (error) {
      this.emit('processing.error', { error: error.message, transcriptData });
    }
  }

  /**
   * Parse a single transcript line
   * @param {string} line - Raw transcript line
   * @returns {Object|null} Parsed transcript or null if invalid
   */
  parseTranscriptLine(line) {
    try {
      // Match both Speaker and You formats
      const match = line.match(/(?:Speaker|You)\[([^\]]+)\]:\s*\[([^\]]+)\]/);
      
      if (match && match.length >= 3) {
        const timestamp = match[1];
        const transcript = match[2].trim();
        
        if (transcript && transcript.length > 0) {
          return {
            transcript,
            timestamp: new Date(timestamp).toISOString(),
            isQuestion: this.detectQuestion(transcript),
            source: 'audio-module',
            platform: line.startsWith('You') ? 'macOS' : 'Windows',
            raw: line
          };
        }
      }
      
      return null;
    } catch (error) {
      this.emit('parsing.error', { error: error.message, line });
      return null;
    }
  }

  /**
   * Handle a parsed transcript
   * @param {Object} transcript - Parsed transcript data
   */
  handleParsedTranscript(transcript) {
    try {
      // Add additional metadata
      const processedTranscript = {
        ...transcript,
        questionConfidence: transcript.isQuestion ? 0.8 : 0.2,
        isFinal: true,
        source: 'audio-module-transcript',
        processedAt: new Date().toISOString()
      };

      // Add to conversation history
      this.conversationHistory.push(processedTranscript);

      // Save conversation if enabled
      if (this.options.enableConversationLogging) {
        this.saveToConversationFile(processedTranscript);
      }

      // Emit processed transcript
      this.emit('transcript.processed', processedTranscript);
      
      // Emit question detected if it's a question
      if (transcript.isQuestion) {
        this.emit('question.detected', processedTranscript);
      }
    } catch (error) {
      this.emit('processing.error', { error: error.message, transcript });
    }
  }

  /**
   * Detect if text is a question
   * @param {string} text - Text to analyze
   * @returns {boolean} True if likely a question
   */
  detectQuestion(text) {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
    const questionPhrases = [
      'can you', 'could you', 'would you', 'will you', 
      'do you', 'did you', 'have you', 'are you', 
      'is there', 'can we', 'should we'
    ];
    const questionKeywords = ['explain', 'describe', 'tell me'];
    
    const lowerText = text.toLowerCase();
    
    return text.endsWith('?') ||
           questionWords.some(word => lowerText.startsWith(word)) ||
           questionPhrases.some(phrase => lowerText.startsWith(phrase)) ||
           questionKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Save transcript to conversation file
   * @param {Object} transcript - Transcript to save
   */
  saveToConversationFile(transcript) {
    try {
      // Ensure conversation directory exists
      if (!fs.existsSync(this.options.conversationDir)) {
        fs.mkdirSync(this.options.conversationDir, { recursive: true });
      }

      // Create session-based filename
      const sessionId = this.getCurrentSessionId();
      const filename = `conversation-transcript-${sessionId}.txt`;
      const filepath = path.join(this.options.conversationDir, filename);

      // Format transcript line
      const timestampFormatted = new Date(transcript.timestamp).toLocaleString();
      const transcriptLine = `[${timestampFormatted}] ${transcript.transcript}\n`;

      // Write header if file doesn't exist
      if (!fs.existsSync(filepath)) {
        const header = `--- Conversation Transcript (Session: ${sessionId}) ---\n\n`;
        fs.writeFileSync(filepath, header);
      }

      // Append transcript
      fs.appendFileSync(filepath, transcriptLine);
      
      this.emit('conversation.saved', { 
        filepath, 
        transcript, 
        sessionId 
      });
    } catch (error) {
      this.emit('conversation.save.error', { 
        error: error.message, 
        transcript 
      });
    }
  }

  /**
   * Get current session ID
   * @returns {string} Session ID
   */
  getCurrentSessionId() {
    if (!this.currentSession) {
      const now = new Date();
      this.currentSession = now.toISOString()
        .replace(/[:.]/g, '-')
        .substring(0, 19); // YYYY-MM-DDTHH-MM-SS format
    }
    return this.currentSession;
  }

  /**
   * Start a new conversation session
   */
  startNewSession() {
    this.currentSession = null;
    this.conversationHistory = [];
    this.emit('session.started', { sessionId: this.getCurrentSessionId() });
  }

  /**
   * Get conversation history
   * @param {number} limit - Optional limit on number of items
   * @returns {Array} Conversation history
   */
  getConversationHistory(limit = null) {
    if (limit && limit > 0) {
      return this.conversationHistory.slice(-limit);
    }
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory() {
    this.conversationHistory = [];
    this.emit('conversation.cleared');
  }

  /**
   * Get statistics about processed transcripts
   * @returns {Object} Statistics
   */
  getStatistics() {
    const total = this.conversationHistory.length;
    const questions = this.conversationHistory.filter(t => t.isQuestion).length;
    const platforms = this.conversationHistory.reduce((acc, t) => {
      acc[t.platform] = (acc[t.platform] || 0) + 1;
      return acc;
    }, {});

    return {
      totalTranscripts: total,
      questionsDetected: questions,
      questionPercentage: total > 0 ? Math.round((questions / total) * 100) : 0,
      platformBreakdown: platforms,
      sessionId: this.getCurrentSessionId(),
      sessionStartTime: this.conversationHistory.length > 0 ? 
        this.conversationHistory[0].timestamp : null
    };
  }

  /**
   * Search conversation history
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Matching transcripts
   */
  searchConversation(query, options = {}) {
    try {
      const {
        caseSensitive = false,
        questionsOnly = false,
        limit = null
      } = options;

      const searchTerm = caseSensitive ? query : query.toLowerCase();
      
      let results = this.conversationHistory.filter(transcript => {
        if (questionsOnly && !transcript.isQuestion) return false;
        
        const text = caseSensitive ? transcript.transcript : transcript.transcript.toLowerCase();
        return text.includes(searchTerm);
      });

      if (limit && limit > 0) {
        results = results.slice(0, limit);
      }

      this.emit('search.completed', { 
        query, 
        resultCount: results.length, 
        options 
      });

      return results;
    } catch (error) {
      this.emit('search.error', { error: error.message, query, options });
      return [];
    }
  }
}

module.exports = TranscriptProcessor; 