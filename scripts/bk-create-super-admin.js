require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const models = require('../src/models/bk');

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI first');
  let email = process.env.BK_BOOTSTRAP_EMAIL;
  let password = process.env.BK_BOOTSTRAP_PASSWORD;
  let displayName = process.env.BK_BOOTSTRAP_NAME || 'Super admin';
  if (!email || !password) {
    if (!process.stdin.isTTY)
      throw new Error(
        'Use an interactive terminal or set BK_BOOTSTRAP_EMAIL and BK_BOOTSTRAP_PASSWORD',
      );
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, done) {
        if (!muted) process.stdout.write(chunk, encoding);
        done();
      },
    });
    const rl = readline.createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });
    try {
      email ||= await rl.question('Super admin email: ');
      displayName =
        (await rl.question('Display name [Super admin]: ')) || displayName;
      if (!password) {
        process.stdout.write('Password (12+ characters, input hidden): ');
        muted = true;
        password = await rl.question('');
        muted = false;
        process.stdout.write('\n');
      }
    } finally {
      rl.close();
    }
  }
  email = z.string().trim().toLowerCase().email().parse(email);
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72)
    throw new Error(
      'Password must be 12+ characters and at most 72 UTF-8 bytes',
    );
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.BK_DB_NAME || 'fitness_db',
  });
  await models.bk_users.init();
  if (await models.bk_users.exists({ email }))
    throw new Error(
      'Email already exists; this command never overwrites credentials',
    );
  await models.bk_users.create({
    email,
    display_name: displayName,
    password_hash: await bcrypt.hash(password, 12),
    role: 'super_admin',
    is_active: true,
  });
  console.log('Super admin created. Sign in at /booking-admin/login.');
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
