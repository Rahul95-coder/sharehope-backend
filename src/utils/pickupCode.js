const crypto = require('crypto');

const generatePickupCode = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-character code
};

module.exports = { generatePickupCode };
