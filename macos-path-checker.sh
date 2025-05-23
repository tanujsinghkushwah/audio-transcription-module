#!/bin/bash
# Path Fix Script for macOS
# This script helps resolve path issues with spaces in directory names

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "Interview Genie Audio Module Path Checker"
echo "========================================"
echo "Script directory: $SCRIPT_DIR"
echo ""

# Check if the current path contains spaces
if [[ "$SCRIPT_DIR" == *" "* ]]; then
    echo "⚠️  WARNING: The installation path contains spaces"
    echo "   This may cause issues with Python script execution"
    echo "   Current path: $SCRIPT_DIR"
    echo ""
    echo "💡 Recommended solutions:"
    echo "   1. Move Interview Genie to a path without spaces (e.g., /Applications/)"
    echo "   2. Use the app's built-in path handling features"
    echo ""
else
    echo "✅ Path is compatible (no spaces detected)"
fi

# Check Python availability
echo "Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo "✅ Python3 found: $PYTHON_VERSION"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1)
    echo "✅ Python found: $PYTHON_VERSION"
else
    echo "❌ Python not found in PATH"
    echo "   Please install Python 3.7+ from https://python.org"
fi

echo ""
echo "For technical support, visit: https://github.com/your-repo/interview-genie"
