#!/usr/bin/env python3
"""
Minimal Python runtime checker for Interview Genie
This script verifies that Python and basic dependencies are available
"""

import sys
import importlib
import json
from datetime import datetime

def check_python_version():
    version = sys.version_info
    return {
        'major': version.major,
        'minor': version.minor,
        'micro': version.micro,
        'version_string': sys.version
    }

def check_packages():
    critical_packages = ['numpy', 'wave', 'threading', 'queue', 'os', 'sys']
    optional_packages = ['torch', 'openai', 'faster_whisper']
    
    results = {
        'critical': {},
        'optional': {}
    }
    
    # Check critical packages
    for package in critical_packages:
        try:
            importlib.import_module(package)
            results['critical'][package] = True
        except ImportError:
            results['critical'][package] = False
    
    # Check optional packages
    for package in optional_packages:
        try:
            importlib.import_module(package)
            results['optional'][package] = True
        except ImportError:
            results['optional'][package] = False
    
    return results

def main():
    result = {
        'timestamp': datetime.now().isoformat(),
        'python_version': check_python_version(),
        'packages': check_packages(),
        'platform': sys.platform
    }
    
    print(json.dumps(result, indent=2))
    
    # Exit with error code if critical packages are missing
    critical_missing = [pkg for pkg, available in result['packages']['critical'].items() if not available]
    if critical_missing:
        print(f"ERROR: Missing critical packages: {', '.join(critical_missing)}", file=sys.stderr)
        sys.exit(1)
    
    sys.exit(0)

if __name__ == '__main__':
    main()
