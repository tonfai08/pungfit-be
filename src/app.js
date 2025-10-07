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
app.use('/api/auth', authRoutes);
app.use('/api/meals', mealRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
