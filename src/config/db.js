const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'fitness_db',
      autoIndex: true,
    });
    const ExerciseMaster = require('../models/exercise-master.model');
    const defaults = require('../data/default-exercises');
    await ExerciseMaster.bulkWrite(defaults.map((exercise) => ({
      updateOne: {
        filter: { name: exercise.name, language: exercise.language },
        update: { $setOnInsert: exercise },
        upsert: true,
      },
    })));
    try {
      const { syncWgerMedia } = require('../services/wger-media-sync.service');
      await syncWgerMedia();
    } catch (mediaError) {
      console.warn(' wger media sync skipped:', mediaError.message);
    }
    console.log(' MongoDB Connected');
  } catch (err) {
    console.error(' MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };
