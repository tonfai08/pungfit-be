const { models, withEvent } = require('./bk-common');

async function expireDueBookings() {
  const due = await models.bk_bookings.find({
    status: 'pending_payment', hold_expires_at: { $lte: new Date() },
  }).select('event_id').limit(100).lean();
  for (const eventId of new Set(due.map(booking => String(booking.event_id)))) {
    await withEvent(eventId, null, 'release_expired_holds', async () => {});
  }
}
function startExpiryWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await expireDueBookings(); }
    catch (error) { console.error('bk expiry failed:', error.name, error.code || ''); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
module.exports = { expireDueBookings, startExpiryWorker };
