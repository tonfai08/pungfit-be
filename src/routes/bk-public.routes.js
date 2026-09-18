const express = require('express');
const path = require('node:path');
const { models, objectId, findOrFail } = require('../services/bk-common');
const { reservedAttendees, reservedQuantity } = require('../services/bk-booking');

const router = express.Router();
const uploadDirectory = () => path.resolve(
  process.env.BK_UPLOAD_DIR || path.join(__dirname, '../../bk_uploads'),
);

function visibleEventQuery(now = new Date()) {
  return {
    status: 'scheduled',
    deleted_at: null,
    publish_at: { $lte: now },
    $or: [{ hide_at: null }, { hide_at: { $exists: false } }, { hide_at: { $gt: now } }],
  };
}

function bookingState(event, available, now) {
  if (event.booking_opens_at > now) return 'upcoming';
  if (event.booking_closes_at <= now) return 'closed';
  if (available <= 0) return event.waitlist_enabled ? 'waitlist' : 'sold_out';
  return 'open';
}

async function publicEvent(event, now) {
  let available = 0;
  let price = event.payment_required === false ? 0 : event.price_per_attendee_satang || 0;
  if (event.booking_mode === 'capacity') {
    available = Math.max(0, event.capacity_limit - await reservedAttendees(event._id));
  } else {
    const types = await models.bk_event_table_types.find({ event_id: event._id, is_active: true }).lean();
    const prices = [];
    for (const type of types) {
      const total = await models.bk_event_tables.countDocuments({
        event_id: event._id, table_type_id: type._id, is_bookable: true,
      });
      available += Math.max(0, total - await reservedQuantity(event._id, type._id));
      prices.push(event.payment_required === false ? 0 : type.price_satang);
    }
    price = prices.length ? Math.min(...prices) : 0;
  }
  return {
    id: String(event._id),
    slug: event.slug,
    name: event.name,
    short_description: event.short_description || '',
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    venue_name: event.venue_name || '',
    booking_mode: event.booking_mode,
    price_satang: price,
    payment_required: event.payment_required !== false,
    availability: bookingState(event, available, now),
    available,
    waitlist_enabled: event.waitlist_enabled,
    cover_url: event.cover_file_id ? `/bk-api/public/files/${event.cover_file_id}` : null,
  };
}

router.get('/events', async (_req, res) => {
  const now = new Date();
  const events = await models.bk_events.find(visibleEventQuery(now)).sort({ starts_at: 1 }).limit(100).lean();
  res.json(await Promise.all(events.map((event) => publicEvent(event, now))));
});

router.get('/files/:id', async (req, res) => {
  objectId.parse(req.params.id);
  const event = await models.bk_events.exists({
    ...visibleEventQuery(),
    $and: [{ $or: [{ cover_file_id: req.params.id }, { poster_file_id: req.params.id }] }],
  });
  if (!event) return res.status(404).json({ error: 'ไม่พบรูปภาพ' });
  const file = await findOrFail(models.bk_files, { _id: req.params.id });
  if (!/^[a-f\d-]+\.webp$/i.test(file.storage_key)) return res.status(404).json({ error: 'ไม่พบรูปภาพ' });
  res.type('image/webp').set('Cache-Control', 'public, max-age=300').set('X-Content-Type-Options', 'nosniff');
  res.sendFile(file.storage_key, { root: uploadDirectory() });
});

module.exports = { router, visibleEventQuery, bookingState };
