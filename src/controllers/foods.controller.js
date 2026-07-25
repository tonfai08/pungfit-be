const FoodMaster = require('../models/food-master.model');

exports.createFood = async (req, res) => {
  try {
    const {
      barcode,
      food_name,
      description,
      brand,
      servingSize,
      servingUnit,
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

    if (!food_name) {
      return res.status(400).json({ error: 'food_name is required' });
    }

    const trimmedBarcode = typeof barcode === 'string' ? barcode.trim() : barcode;
    if (trimmedBarcode) {
      const exists = await FoodMaster.findOne({ barcode: trimmedBarcode });
      if (exists) {
        return res.status(409).json({ error: 'Food with this barcode already exists' });
      }
    }

    const food = await FoodMaster.create({
      barcode: trimmedBarcode || undefined,
      food_name,
      description,
      brand,
      servingSize,
      servingUnit,
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

    res.status(201).json({ success: true, food });
  } catch (err) {
    console.error('Error creating food master:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createFoodsBulk = async (req, res) => {
  try {
    const { foods } = req.body;
    if (!Array.isArray(foods) || foods.length === 0) {
      return res.status(400).json({ error: 'foods array is required' });
    }

    const sanitized = foods.map((food) => {
      const trimmedBarcode = typeof food.barcode === 'string' ? food.barcode.trim() : food.barcode;
      return {
        ...food,
        barcode: trimmedBarcode || undefined,
      };
    });

    const missingRequired = sanitized.filter((f) => !f.food_name);
    if (missingRequired.length > 0) {
      return res.status(400).json({ error: 'each food requires food_name' });
    }

    // check duplicate barcode inside payload
    const seen = new Set();
    const dupes = [];
    for (const item of sanitized) {
      if (!item.barcode) {
        continue;
      }
      if (seen.has(item.barcode)) {
        dupes.push(item.barcode);
      }
      seen.add(item.barcode);
    }
    if (dupes.length > 0) {
      return res.status(400).json({ error: 'duplicate barcodes in payload', barcodes: [...new Set(dupes)] });
    }

    // check existing barcodes in DB
    const barcodes = sanitized.map((f) => f.barcode).filter(Boolean);
    if (barcodes.length > 0) {
      const existing = await FoodMaster.find({ barcode: { $in: barcodes } }, 'barcode');
      if (existing.length > 0) {
        return res.status(409).json({
          error: 'Some barcodes already exist',
          barcodes: existing.map((e) => e.barcode),
        });
      }
    }

    const inserted = await FoodMaster.insertMany(sanitized);
    res.status(201).json({ success: true, inserted: inserted.length, foods: inserted });
  } catch (err) {
    console.error('Error creating food master bulk:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getFoodByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({ error: 'barcode param is required' });
    }

    const food = await FoodMaster.findOne({ barcode: barcode.trim() });
    if (!food) {
      return res.status(404).json({ error: 'Food not found' });
    }

    res.json({ success: true, food });
  } catch (err) {
    console.error('Error fetching food by barcode:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getFoodsPublic = async (req, res) => {
  try {
    const foods = await FoodMaster.find({ userId: null }).sort({ createdAt: -1 });
    res.json({ success: true, foods });
  } catch (err) {
    console.error('Error fetching public foods:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getFoodsMe = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const foods = await FoodMaster.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, foods });
  } catch (err) {
    console.error('Error fetching user foods:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateFood = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (!id) {
      return res.status(400).json({ error: 'id param is required' });
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'barcode')) {
      if (typeof updates.barcode === 'string') {
        updates.barcode = updates.barcode.trim() || undefined;
      }
    }

    if (updates.barcode) {
      const duplicate = await FoodMaster.findOne({
        barcode: updates.barcode,
        _id: { $ne: id },
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Another food already uses this barcode' });
      }
    }

    const food = await FoodMaster.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!food) {
      return res.status(404).json({ error: 'Food not found' });
    }

    res.json({ success: true, food });
  } catch (err) {
    console.error('Error updating food master:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
