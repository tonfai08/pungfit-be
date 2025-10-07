const jwt = require('jsonwebtoken');

const sign = (payload, opts = {}) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.TOKEN_EXPIRES || '7d',
    ...opts
  });
};

const verify = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { sign, verify };
