#!/bin/bash
# Microphone Permission Helper for Interview Genie
# This script helps users understand and resolve microphone permission issues

echo "Interview Genie Microphone Permission Helper"
echo "==========================================="
echo ""

# Check if Interview Genie has microphone permission
if ! sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT * FROM access WHERE service='kTCCServiceMicrophone' AND client='com.anonymousspacecorp.interviewgenie';" | grep -q "com.anonymousspacecorp.interviewgenie"; then
    echo "❌ Interview Genie does not have microphone permission"
    echo ""
    echo "To enable microphone access:"
    echo "1. Open System Preferences"
    echo "2. Go to Security & Privacy"
    echo "3. Click the Privacy tab"
    echo "4. Select Microphone from the list"
    echo "5. Check the box next to Interview Genie"
    echo ""
    echo "Or run: open 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'"
else
    echo "✅ Interview Genie has microphone permission"
fi

echo ""
echo "For technical support, visit: https://github.com/your-repo/interview-genie"
