const Meal = require('../models/meal.model');
const dayjs = require('dayjs');

const NUTRITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    food_name: { type: 'string' },
    description: { type: 'string' },
    calories: { type: 'number' },
    protein: { type: 'number' },
    fat: { type: 'number' },
    carbs: { type: 'number' },
    sugar: { type: 'number' },
    fiber: { type: 'number' },
    sodium: { type: 'number' },
    cholesterol: { type: 'number' },
    calcium: { type: 'number' },
    iron: { type: 'number' },
    potassium: { type: 'number' },
    vitaminC: { type: 'number' },
    vitaminD: { type: 'number' },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: [
    'food_name',
    'description',
    'calories',
    'protein',
    'fat',
    'carbs',
    'sugar',
    'fiber',
    'sodium',
    'cholesterol',
    'calcium',
    'iron',
    'potassium',
    'vitaminC',
    'vitaminD',
    'confidence',
    'notes',
  ],
};

const clampNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const normalizeLang = (lang) => {
  const value = String(lang || 'th').trim().toLowerCase();
  return value === 'en' ? 'en' : 'th';
};

const normalizeAnalyzedMeal = (meal) => ({
  food_name: String(meal.food_name || 'Unknown food').trim(),
  description: String(meal.description || '').trim(),
  calories: clampNumber(meal.calories),
  protein: clampNumber(meal.protein),
  fat: clampNumber(meal.fat),
  carbs: clampNumber(meal.carbs),
  sugar: clampNumber(meal.sugar),
  fiber: clampNumber(meal.fiber),
  sodium: clampNumber(meal.sodium),
  cholesterol: clampNumber(meal.cholesterol),
  calcium: clampNumber(meal.calcium),
  iron: clampNumber(meal.iron),
  potassium: clampNumber(meal.potassium),
  vitaminC: clampNumber(meal.vitaminC),
  vitaminD: clampNumber(meal.vitaminD),
  confidence: Math.min(Math.max(clampNumber(meal.confidence), 0), 1),
  notes: String(meal.notes || '').trim(),
});

const extractResponseText = (data) => {
  if (typeof data.output_text === 'string') return data.output_text;

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n');
};

const parseJsonText = (text) => {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(cleaned);
};

const buildOpenAIRequestBody = (imageDataUrl, lang = 'th', structured = true) => {
  const outputLanguage = lang === 'en' ? 'English' : 'Thai';
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Analyze this meal photo and estimate nutrition for the visible edible portion.',
              'Return only JSON matching the schema.',
              `Use ${outputLanguage} for food_name, description, and notes.`,
              'Required keys: food_name, description, calories, protein, fat, carbs, sugar, fiber, sodium, cholesterol, calcium, iron, potassium, vitaminC, vitaminD, confidence, notes.',
              'Use grams for protein/fat/carbs/sugar/fiber, mg for sodium/cholesterol/calcium/iron/potassium/vitaminC, IU for vitaminD.',
              'If the image is unclear, make a conservative estimate and explain uncertainty in notes.',
            ].join(' '),
          },
          {
            type: 'input_image',
            image_url: imageDataUrl,
            detail: 'low',
          },
        ],
      },
    ],
    max_output_tokens: 800,
    store: false,
  };

  if (structured) {
    body.text = {
      format: {
        type: 'json_schema',
        name: 'meal_nutrition_estimate',
        schema: NUTRITION_SCHEMA,
        strict: true,
      },
    };
  }

  return body;
};

const requestMealAnalysis = async (imageDataUrl, lang = 'th') => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.statusCode = 503;
    throw error;
  }

  const sendRequest = async (structured) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAIRequestBody(imageDataUrl, lang, structured)),
    });

    const data = await response.json().catch(() => ({}));
    return { response, data };
  };

  let { response, data } = await sendRequest(true);
  if (!response.ok && response.status === 400) {
    ({ response, data } = await sendRequest(false));
  }

  if (!response.ok) {
    const error = new Error(data.error?.message || 'OpenAI request failed');
    error.statusCode = response.status;
    throw error;
  }

  return normalizeAnalyzedMeal(parseJsonText(extractResponseText(data)));
};

const requestMealTextAnalysis = async (description, lang = 'th') => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.statusCode = 503;
    throw error;
  }
  const outputLanguage = lang === 'en' ? 'English' : 'Thai';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [{ role: 'user', content: [{ type: 'input_text', text: [
        'Estimate nutrition for the food and serving amount described below.',
        `Food description: ${description}`,
        `Use ${outputLanguage} for food_name, description, and notes.`,
        'Return only JSON matching the schema. Use grams for protein/fat/carbs/sugar/fiber, mg for sodium/cholesterol/calcium/iron/potassium/vitaminC, and IU for vitaminD.',
      ].join(' ') }] }],
      text: { format: { type: 'json_schema', name: 'meal_nutrition_estimate', schema: NUTRITION_SCHEMA, strict: true } },
      max_output_tokens: 800,
      store: false,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || 'OpenAI request failed');
    error.statusCode = response.status;
    throw error;
  }
  return normalizeAnalyzedMeal(parseJsonText(extractResponseText(data)));
};

exports.createMealRecord = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      date,
      meal_type,
      sequence,
      food_name,
      description,
      barcode,
      calories,
      protein,
      fat,
      carbs,
      sugar,
      fiber,
      sodium,
      cholesterol,
      calcium,
      iron,
      potassium,
      vitaminC,
      vitaminD,
    } = req.body;

    if (!meal_type || !food_name) {
      return res.status(400).json({ error: 'meal_type and food_name are required' });
    }

    const baseDate = date ? dayjs(date) : dayjs();
    if (!baseDate.isValid()) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    const dateObj = baseDate.startOf('day').toDate();

    const meal = await Meal.create({
      userId,
      date: dateObj,
      meal_type,
      sequence,
      food_name,
      description,
      barcode,
      calories,
      protein,
      fat,
      carbs,
      sugar,
      fiber,
      sodium,
      cholesterol,
      calcium,
      iron,
      potassium,
      vitaminC,
      vitaminD,
    });

    res.json({ success: true, meal });
  } catch (err) {
    console.error('Error creating meal record:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMealsByDate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    const start = dayjs(date).startOf('day').toDate();
    const end = dayjs(date).endOf('day').toDate();

    const meals = await Meal.find({
      userId,
      date: { $gte: start, $lte: end },
    }).sort({ meal_type: 1, sequence: 1 });

    const summary = meals.reduce(
      (acc, meal) => {
        acc.calories += meal.calories || 0;
        acc.protein += meal.protein || 0;
        acc.fat += meal.fat || 0;
        acc.carbs += meal.carbs || 0;
        acc.sugar += meal.sugar || 0;
        acc.fiber += meal.fiber || 0;
        acc.sodium += meal.sodium || 0;
        acc.cholesterol += meal.cholesterol || 0;
        acc.calcium += meal.calcium || 0;
        acc.iron += meal.iron || 0;
        acc.potassium += meal.potassium || 0;
        acc.vitaminC += meal.vitaminC || 0;
        acc.vitaminD += meal.vitaminD || 0;
        return acc;
      },
      {
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        sugar: 0,
        fiber: 0,
        sodium: 0,
        cholesterol: 0,
        calcium: 0,
        iron: 0,
        potassium: 0,
        vitaminC: 0,
        vitaminD: 0,
      }
    );

    res.json({
      success: true,
      meals,
      summary,
    });
  } catch (err) {
    console.error('Error fetching meals:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.analyzeMealImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'image is required' });
    }

    const lang = normalizeLang(req.body.lang);
    const imageDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const meal = await requestMealAnalysis(imageDataUrl, lang);

    res.json({
      success: true,
      lang,
      meal,
      message: 'Nutrition estimate generated. Please review before saving.',
    });
  } catch (err) {
    console.error('Error analyzing meal image:', err);
    res.status(err.statusCode || 500).json({
      error: err.statusCode === 503 ? err.message : 'Failed to analyze meal image',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
};

exports.analyzeMealText = async (req, res) => {
  try {
    const description = String(req.body?.description || '').trim();
    if (description.length < 3 || description.length > 2000) {
      return res.status(400).json({ error: 'description must be between 3 and 2000 characters' });
    }
    const meal = await requestMealTextAnalysis(description, normalizeLang(req.body?.lang));
    return res.json({ success: true, meal });
  } catch (err) {
    console.error('Error analyzing meal text:', err);
    return res.status(err.statusCode === 503 ? 503 : 502).json({
      error: err.statusCode === 503 ? err.message : 'Failed to analyze meal text',
    });
  }
};

exports.deleteMeal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const meal = await Meal.findOneAndDelete({ _id: id, userId });
    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    res.json({ success: true, message: 'Meal deleted', meal });
  } catch (err) {
    console.error('Error deleting meal:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
