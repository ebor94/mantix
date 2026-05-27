/**
 * sv/utils/password.js
 * Wrapper bcryptjs con rondas configurables.
 */
const bcrypt = require('bcryptjs');
const { BCRYPT_ROUNDS } = require('../config/constants');

async function hash(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function compare(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

module.exports = { hash, compare };
