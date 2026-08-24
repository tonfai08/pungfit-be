const UserWorkoutPlan = require('../models/user-workout-plan.model');
const ExerciseMaster = require('../models/exercise-master.model');

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

exports.generateWorkoutPlanWithAI = async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (prompt.length < 10 || prompt.length > 2000) {
      return res.status(400).json({ error: 'กรุณาอธิบายตารางที่ต้องการอย่างน้อย 10 ตัวอักษร' });
    }
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured' });
    const exercises = await ExerciseMaster.find({ is_archived: false }).select('_id name difficulty equipment movement_pattern').lean();
    if (!exercises.length) return res.status(503).json({ error: 'ยังไม่มีท่าออกกำลังกายในระบบ' });
    const itemSchema = {
      type: 'object', additionalProperties: false,
      properties: {
        exercise_name: { type: 'string', enum: exercises.map((item) => item.name) },
        type: { type: 'string', enum: ['strength', 'cardio'] },
        sets: { type: ['integer', 'null'] }, reps: { type: ['integer', 'null'] },
        time_min: { type: ['integer', 'null'] }, notes: { type: 'string' },
      },
      required: ['exercise_name', 'type', 'sets', 'reps', 'time_min', 'notes'],
    };
    const daysProperties = Object.fromEntries(DAY_KEYS.map((day) => [day, { type: 'array', items: itemSchema, maxItems: 10 }]));
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', store: false, max_output_tokens: 3000,
        input: [{ role: 'user', content: [{ type: 'input_text', text: `Create a safe one-week workout plan in Thai using only the supplied exercise names. Respect rest days, experience, equipment, limitations, and goals. User request: ${prompt}` }] }],
        text: { format: { type: 'json_schema', name: 'weekly_workout_plan', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: { days: { type: 'object', additionalProperties: false, properties: daysProperties, required: DAY_KEYS }, note: { type: 'string' } },
          required: ['days', 'note'],
        } } },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'สร้างตารางไม่สำเร็จ' });
    const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('');
    const generated = JSON.parse(text);
    const byName = new Map(exercises.map((item) => [item.name, item._id]));
    const days = Object.fromEntries(DAY_KEYS.map((day) => [day, generated.days[day].map((item) => ({
      exerciseId: byName.get(item.exercise_name), exerciseName: item.exercise_name, type: item.type,
      ...(item.sets ? { sets: item.sets } : {}), ...(item.reps ? { reps: item.reps } : {}),
      ...(item.time_min ? { time_min: item.time_min } : {}), notes: item.notes,
    }))]));
    return res.json({ plan: { weekLabel: `AI-${Date.now()}`, days, note: generated.note, is_active: true } });
  } catch (err) {
    console.error('AI workout plan error:', err);
    return res.status(500).json({ error: 'สร้างตารางด้วย AI ไม่สำเร็จ' });
  }
};

exports.getMyWorkoutPlan = async (req, res) => {
  try {
    const { id } = req.user;
    const { weekLabel } = req.query;

    const query = { userId: id };
    if (weekLabel) query.weekLabel = weekLabel;

    const workoutPlan = await UserWorkoutPlan.findOne(query)
      .sort(weekLabel ? undefined : { createdAt: -1 })
      .populate('days.mon.exerciseId')
      .populate('days.tue.exerciseId')
      .populate('days.wed.exerciseId')
      .populate('days.thu.exerciseId')
      .populate('days.fri.exerciseId')
      .populate('days.sat.exerciseId')
      .populate('days.sun.exerciseId')
      .lean();

    if (!workoutPlan) {
      return res.status(404).json({ error: 'Workout plan not found' });
    }

    return res.json({ workoutPlan });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.upsertMyWorkoutPlan = async (req, res) => {
  try {
    const { id } = req.user;
    const { weekLabel, days, note, is_active } = req.body;

    if (!weekLabel) {
      return res.status(400).json({ error: 'weekLabel is required' });
    }

    const updates = {
      days,
      note,
      is_active,
    };

    const workoutPlan = await UserWorkoutPlan.findOneAndUpdate(
      { userId: id, weekLabel },
      { $set: updates, $setOnInsert: { userId: id, weekLabel } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.json({ message: 'Workout plan saved', workoutPlan });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
