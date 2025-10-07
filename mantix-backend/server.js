// Server entry point
const app = require('./src/app');
const { PORT = 3000 } = require('./src/config/constants');

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the API`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Server shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Server shutting down gracefully');
  process.exit(0);
});