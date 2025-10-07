// Error handler middleware
const errorHandler = (err, req, res, next) => {
  // Error handling logic will be implemented here
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
};

module.exports = errorHandler;