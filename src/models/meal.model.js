const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  ref_type: { type: String, enum: ['food','recipe'], required: true },
  ref_id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  quantity_g: Number,
  servings: Number,
  nutrients_cache: {
    energy_kcal: Number, protein_g: Number, fat_g: Number, carb_g: Number,
    fiber_g: Number, sugar_g: Number, sodium_mg: Number
  }
}, {_id:false});

const MealEntrySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  date:    { type: String, index: true, required: true }, // 'YYYY-MM-DD'
  meal_type: { type: String, enum: ['breakfast','lunch','dinner','snack'], required: true },
  items: [ItemSchema],
  totals: {
    energy_kcal: Number, protein_g: Number, fat_g: Number, carb_g: Number,
    fiber_g: Number, sugar_g: Number, sodium_mg: Number
  },
  visibility: { type: String, enum: ['private','groups','public'], default: 'groups' },
  source: { type: String, enum: ['manual','import','barcode'], default: 'manual' }
}, { timestamps: true });

MealEntrySchema.index({ user_id: 1, date: 1 });

// auto-sum totals if not provided
MealEntrySchema.pre('save', function(next){
  if (!this.totals && Array.isArray(this.items)) {
    const sum = this.items.reduce((acc, it) => {
      const n = it.nutrients_cache || {};
      acc.energy_kcal += n.energy_kcal || 0;
      acc.protein_g   += n.protein_g || 0;
      acc.fat_g       += n.fat_g || 0;
      acc.carb_g      += n.carb_g || 0;
      acc.fiber_g     += n.fiber_g || 0;
      acc.sugar_g     += n.sugar_g || 0;
      acc.sodium_mg   += n.sodium_mg || 0;
      return acc;
    }, { energy_kcal:0, protein_g:0, fat_g:0, carb_g:0, fiber_g:0, sugar_g:0, sodium_mg:0 });
    this.totals = sum;
  }
  next();
});

module.exports = mongoose.model('MealEntry', MealEntrySchema);
