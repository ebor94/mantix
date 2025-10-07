// Logger utility
const fs = require('fs');
const path = require('path');

const logger = {
  // Log info message
  info: (message) => {
    const logMessage = `[INFO] ${new Date().toISOString()}: ${message}\n`;
    console.log(logMessage);
    // In a real app, you would write to a log file
  },

  // Log error message
  error: (message) => {
    const logMessage = `[ERROR] ${new Date().toISOString()}: ${message}\n`;
    console.error(logMessage);
    // In a real app, you would write to a log file
  },

  // Log warning message
  warn: (message) => {
    const logMessage = `[WARN] ${new Date().toISOString()}: ${message}\n`;
    console.warn(logMessage);
    // In a real app, you would write to a log file
  }
};

module.exports = logger;