const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
require('dotenv').config();
const { connectDB } = require('./config/db');
const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

connectDB();

app.get('/', (req, res) => {
  res.json({ message: 'Fitness API running ✅' });
});

// routes ตัวอย่าง
const authRoutes = require('./routes/auth.routes');
const mealRoutes = require('./routes/meals.routes');
const foodRoutes = require('./routes/foods.routes');
const userRoutes = require('./routes/user');
const weightRoutes = require('./routes/weight.routes');
const groupRoutes = require('./routes/group.routes');
const exerciseMasterRoutes = require('./routes/exercise-master.routes');
const workoutPlanRoutes = require('./routes/user-workout-plan.routes');
const exerciseLogRoutes = require('./routes/exercise-log.routes');
const werewolfRoutes = require('./routes/werewolf.routes');
const waterIntakeRoutes = require('./routes/water-intake.routes');

app.use(cors());
app.use('/v1/auth', authRoutes);
app.use('/v1/meals', mealRoutes);
app.use('/v1/foods', foodRoutes);
app.use('/v1/users', userRoutes);
app.use('/v1/weight', weightRoutes);
app.use('/v1/groups', groupRoutes);
app.use('/v1/exercise-masters', exerciseMasterRoutes);
app.use('/v1/workout-plans', workoutPlanRoutes);
app.use('/v1/exercise-logs', exerciseLogRoutes);
app.use('/v1/werewolf', werewolfRoutes);
app.use('/v1/water-intakes', waterIntakeRoutes);
app.use('/v1/uploads', express.static('uploads'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
