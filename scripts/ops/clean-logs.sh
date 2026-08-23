#!/bin/bash

# Laundromat Log Cleanup Script
# This script cleans up log files and temporary files

echo "Starting log cleanup..."

# Clean up log files outside of logs directory
echo "Removing stray log files..."
find . -name "*.log" -type f ! -path "./node_modules/*" ! -path "./.git/*" ! -path "./logs/*" -exec rm {} + 2>/dev/null

# Clean up .out files
echo "Removing .out files..."
find . -name "*.out" -type f ! -path "./node_modules/*" ! -path "./.git/*" -exec rm {} + 2>/dev/null

# Clean up temporary files
echo "Removing temporary files..."
find . -name "*.tmp" -o -name "*.temp" -o -name "*.bak" -o -name "*~" | grep -v node_modules | xargs rm -f 2>/dev/null

# Clear logs in logs directory (keep files, just empty them)
echo "Clearing application logs..."
for file in logs/*.log; do
    if [ -f "$file" ]; then
        > "$file"
        echo "  Cleared: $file"
    fi
done

# Flush PM2 logs if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "Flushing PM2 logs..."
    pm2 flush
fi

# Clean up coverage output files
echo "Removing coverage output files..."
rm -f /tmp/coverage*.txt /tmp/unit-coverage.txt coverage-output.txt coverage-final.txt 2>/dev/null

echo "Log cleanup complete!"
echo ""
echo "Note: Application logs in ./logs/ have been cleared but files preserved."
echo "PM2 logs have been flushed if PM2 is installed."