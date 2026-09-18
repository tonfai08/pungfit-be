const { mongoose, bk_options, bk_ref, bk_integer, bk_model } = require('./bk_shared');

const bk_booking_itemsSchema = new mongoose.Schema({
  booking_id: bk_ref('bk_bookings', true),
  table_type_id: bk_ref('bk_event_table_types', true),
  quantity: bk_integer(1, { required: true }),
  unit_price_satang: bk_integer(0, { required: true }),
  capacity_per_table: bk_integer(1, { required: true }),
  line_total_satang: bk_integer(0, { required: true }),
}, bk_options);
bk_booking_itemsSchema.index({ booking_id: 1, table_type_id: 1 }, { unique: true });
bk_booking_itemsSchema.index({ table_type_id: 1 });
bk_booking_itemsSchema.pre('validate', function () {
  if (this.line_total_satang !== this.quantity * this.unit_price_satang) {
    this.invalidate('line_total_satang', 'Line total must equal quantity multiplied by unit price');
  }
});

module.exports = bk_model('bk_booking_items', bk_booking_itemsSchema);
