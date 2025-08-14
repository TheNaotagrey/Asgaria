const logger = require('./logger');

function handleError(res, err) {
  logger.error(err.stack || err.message || err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = handleError;
