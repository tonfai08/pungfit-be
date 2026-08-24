const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require(
  '@modelcontextprotocol/sdk/server/streamableHttp.js'
);
const { z } = require('zod');
const ExerciseLog = require('../models/exercise-log.model');
const exerciseLogService = require('../services/exercise-log.service');
const Meal = require('../models/meal.model');

const setSchema = z.object({
  weight_kg: z.number().min(0).max(1000).optional(),
  reps: z.number().int().min(0).max(1000).optional(),
});

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['weight', 'cardio']).default('weight'),
  sets: z.array(setSchema).min(1).max(5).optional(),
  duration_min: z.number().min(0).max(1440).optional(),
  intensity: z.enum(['low', 'moderate', 'high']).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const nutritionNumber = z.number().min(0).max(100000).optional();
const mealSchema = z.object({
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  food_name: z.string().trim().min(1).max(250),
  description: z.string().trim().max(1000).optional(),
  sequence: z.number().int().min(1).max(20).optional(),
  calories: nutritionNumber,
  protein: nutritionNumber,
  fat: nutritionNumber,
  carbs: nutritionNumber,
  sugar: nutritionNumber,
  fiber: nutritionNumber,
  sodium: nutritionNumber,
});

const requireScope = (user, scope) => {
  if (!user.scopes.includes(scope)) {
    const error = new Error(`Missing required scope: ${scope}`);
    error.code = 'MISSING_SCOPE';
    throw error;
  }
};

const requireMealScope = (user, access) => {
  const mealScope = `meal:${access}`;
  const legacyScope = `workout:${access}`;
  if (!user.scopes.includes(mealScope) && !user.scopes.includes(legacyScope)) {
    const error = new Error(`Missing required scope: ${mealScope}`);
    error.code = 'MISSING_SCOPE';
    throw error;
  }
};

const toLogPayload = (exercise, performedAt, clientRequestId) => {
  const payload = {
    name: exercise.name,
    type: exercise.type,
    duration_min: exercise.duration_min,
    intensity: exercise.intensity,
    notes: exercise.notes,
    performed_at: performedAt,
    source: 'mcp',
    client_request_id: clientRequestId,
  };

  (exercise.sets || []).forEach((set, index) => {
    const setNumber = index + 1;
    payload[`set${setNumber}_weight_kg`] = set.weight_kg;
    payload[`set${setNumber}_reps`] = set.reps;
  });

  return payload;
};

const getDateRange = (date, timezoneOffsetMinutes) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(date)) throw new Error('date must use YYYY-MM-DD format');

  const [year, month, day] = date.split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const start = new Date(localMidnightAsUtc - timezoneOffsetMinutes * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

const jsonResult = (value) => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  structuredContent: value,
});

const errorResult = (message) => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

const createPungfitMcpServer = (user, serverName = 'pungfit') => {
  const server = new McpServer({ name: serverName, version: '1.1.0' });

  server.registerTool(
    'record_workout',
    {
      description:
        'Record one or more completed exercises for the authenticated PungFit user. Never guess missing sets, reps, weight, or duration; ask the user first.',
      inputSchema: {
        performed_at: z
          .string()
          .datetime({ offset: true })
          .describe('Workout date/time as ISO 8601 including timezone offset'),
        exercises: z.array(exerciseSchema).min(1).max(20),
        client_request_id: z
          .string()
          .trim()
          .min(8)
          .max(120)
          .optional()
          .describe('Stable unique ID used to prevent duplicate recording'),
      },
    },
    async ({ performed_at, exercises, client_request_id }) => {
      try {
        requireScope(user, 'workout:write');
        const performedAt = new Date(performed_at);
        if (Number.isNaN(performedAt.getTime())) {
          return errorResult('Invalid performed_at value');
        }

        for (const exercise of exercises) {
          if (exercise.type === 'weight' && !exercise.sets?.length) {
            return errorResult(`Weight exercise ${exercise.name} requires at least one set`);
          }
          if (exercise.type === 'cardio' && exercise.duration_min == null) {
            return errorResult(`Cardio exercise ${exercise.name} requires duration_min`);
          }
        }

        const requestId = client_request_id || randomUUID();
        const logs = [];
        for (let index = 0; index < exercises.length; index += 1) {
          const itemRequestId = `${requestId}:${index}`;
          const existing = await ExerciseLog.findOne({
            userId: user.id,
            client_request_id: itemRequestId,
          });
          if (existing) {
            logs.push(existing);
            continue;
          }

          const payload = toLogPayload(
            exercises[index],
            performedAt,
            itemRequestId
          );
          logs.push(await exerciseLogService.createExerciseLog(user, payload));
        }

        return jsonResult({
          success: true,
          duplicate_safe_request_id: requestId,
          recorded_count: logs.length,
          logs,
        });
      } catch (error) {
        console.error('MCP record_workout error:', error);
        return errorResult(error.message || 'Unable to record workout');
      }
    }
  );

  server.registerTool(
    'get_today_workouts',
    {
      description:
        'Get workouts for a calendar date in the authenticated PungFit user timezone.',
      inputSchema: {
        date: z.string().describe('Calendar date in YYYY-MM-DD format'),
        timezone_offset_minutes: z
          .number()
          .int()
          .min(-720)
          .max(840)
          .default(420)
          .describe('UTC offset in minutes; Thailand is 420'),
      },
    },
    async ({ date, timezone_offset_minutes }) => {
      try {
        requireScope(user, 'workout:read');
        const { start, end } = getDateRange(date, timezone_offset_minutes);
        const logs = await exerciseLogService.getExerciseLogsByUser(user, {
          start,
          end,
        });
        return jsonResult({ success: true, date, count: logs.length, logs });
      } catch (error) {
        console.error('MCP get_today_workouts error:', error);
        return errorResult(error.message || 'Unable to get workouts');
      }
    }
  );

  server.registerTool(
    'record_meals',
    {
      description:
        'Record one or more meals for the authenticated PungFit user. Use the nutrition values supplied or explicitly estimated in the conversation; do not invent missing nutrition values. Meal types are breakfast, lunch, dinner, or snack.',
      inputSchema: {
        date: z.string().describe('Meal calendar date in YYYY-MM-DD format'),
        meals: z.array(mealSchema).min(1).max(20),
        client_request_id: z.string().trim().min(8).max(120).optional()
          .describe('Stable unique ID used to prevent duplicate recording'),
      },
    },
    async ({ date, meals, client_request_id }) => {
      try {
        requireMealScope(user, 'write');
        getDateRange(date, 420);
        const requestId = client_request_id || randomUUID();
        const recorded = [];
        for (let index = 0; index < meals.length; index += 1) {
          const itemRequestId = `${requestId}:${index}`;
          const existing = await Meal.findOne({ userId: user.id, client_request_id: itemRequestId });
          if (existing) { recorded.push(existing); continue; }
          recorded.push(await Meal.create({
            userId: user.id,
            date: new Date(`${date}T00:00:00.000Z`),
            ...meals[index],
            source: 'mcp',
            client_request_id: itemRequestId,
          }));
        }
        return jsonResult({ success: true, date, duplicate_safe_request_id: requestId, recorded_count: recorded.length, meals: recorded });
      } catch (error) {
        console.error('MCP record_meals error:', error);
        return errorResult(error.message || 'Unable to record meals');
      }
    }
  );

  server.registerTool(
    'get_meals_by_date',
    {
      description: 'Get meals and nutrition totals for a calendar date for the authenticated PungFit user.',
      inputSchema: { date: z.string().describe('Calendar date in YYYY-MM-DD format') },
    },
    async ({ date }) => {
      try {
        requireMealScope(user, 'read');
        const { start, end } = getDateRange(date, 0);
        const meals = await Meal.find({ userId: user.id, date: { $gte: start, $lte: end } })
          .sort({ meal_type: 1, sequence: 1 });
        const totals = meals.reduce((sum, meal) => {
          ['calories', 'protein', 'fat', 'carbs', 'sugar', 'fiber', 'sodium'].forEach((key) => { sum[key] += meal[key] || 0; });
          return sum;
        }, { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0, fiber: 0, sodium: 0 });
        return jsonResult({ success: true, date, count: meals.length, totals, meals });
      } catch (error) {
        console.error('MCP get_meals_by_date error:', error);
        return errorResult(error.message || 'Unable to get meals');
      }
    }
  );

  return server;
};

const handleMcpRequest = async (req, res) => {
  const serverName = req.baseUrl === '/mcp-v2' ? 'pungfit-v2' : 'pungfit';
  const server = createPungfitMcpServer(req.user, serverName);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP transport error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP server error' },
        id: null,
      });
    }
  }
};

module.exports = { handleMcpRequest };
