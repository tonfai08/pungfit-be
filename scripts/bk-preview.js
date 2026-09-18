// Local disposable preview. Deliberately does not load .env or MONGO_URI.
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const express = require('express');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const models = require('../src/models/bk');
const { saveEventLayout } = require('../src/services/bk-layout');
let database, server;
async function main() {
  process.env.BK_ALLOWED_ORIGINS =
    'http://127.0.0.1:3100,http://localhost:3100';
  process.env.BK_UPLOAD_DIR = path.resolve('.cache/preview-uploads');
  database = await MongoMemoryReplSet.create({
    binary: { version: '7.0.24', downloadDir: path.resolve('.cache/mongodb') },
    replSet: { count: 1 },
  });
  await mongoose.connect(database.getUri(), {
    dbName: 'bk_disposable_preview',
  });
  await Promise.all(Object.values(models).map((Model) => Model.init()));
  const user = await models.bk_users.create({
    email: 'preview@example.test',
    display_name: 'ผู้ดูแลตัวอย่าง',
    role: 'super_admin',
    password_hash: await bcrypt.hash('Preview-only-593!', 12),
  });
  const event = await models.bk_events.create({
    name: 'Garden Sessions · Acoustic Night',
    slug: 'garden-sessions',
    short_description: 'ค่ำคืนดนตรีอะคูสติก ท่ามกลางสวนและบรรยากาศอบอุ่น',
    venue_name: 'The Garden Hall',
    status: 'scheduled',
    starts_at: new Date('2026-12-12T18:00:00+07:00'),
    ends_at: new Date('2026-12-12T22:00:00+07:00'),
    publish_at: new Date('2026-09-01T08:00:00+07:00'),
    booking_opens_at: new Date('2026-09-01T09:00:00+07:00'),
    booking_closes_at: new Date('2026-12-12T17:00:00+07:00'),
    waitlist_enabled: true,
    created_by: user._id,
  });
  const type = await models.bk_event_table_types.create({
    event_id: event._id,
    name: 'Garden Table',
    capacity: 4,
    price_satang: 200000,
  });
  const vip = await models.bk_event_table_types.create({
    event_id: event._id,
    name: 'Front Row VIP',
    capacity: 6,
    price_satang: 450000,
  });
  const objects = [
    {
      _id: new mongoose.Types.ObjectId().toString(),
      kind: 'stage',
      label: 'ACOUSTIC STAGE',
      x: 300,
      y: 35,
      width: 400,
      height: 65,
      rotation: 0,
      z_index: 0,
      properties_json: { shape: 'rect', capacity: 1 },
    },
  ];
  for (let i = 0; i < 8; i++) {
    const table = {
      _id: new mongoose.Types.ObjectId().toString(),
      kind: 'table',
      label: `${i < 4 ? 'A' : 'B'}0${(i % 4) + 1}`,
      x: 140 + (i % 4) * 210,
      y: i < 4 ? 210 : 425,
      width: 90,
      height: 90,
      rotation: 0,
      z_index: objects.length,
      properties_json: { shape: 'round', capacity: i < 4 ? 6 : 4 },
      table_type_id: String(i < 4 ? vip._id : type._id),
      is_bookable: true,
    };
    objects.push(table);
    for (let seat = 0; seat < table.properties_json.capacity; seat++) {
      const angle = (2 * Math.PI * seat) / table.properties_json.capacity;
      objects.push({
        _id: new mongoose.Types.ObjectId().toString(),
        parent_object_id: table._id,
        kind: 'chair',
        label: `ที่นั่ง ${seat + 1}`,
        x: Math.round(table.x + 35 + Math.cos(angle) * 68),
        y: Math.round(table.y + 35 + Math.sin(angle) * 68),
        width: 20,
        height: 20,
        rotation: 0,
        z_index: objects.length,
        properties_json: { shape: 'round', capacity: 1 },
      });
    }
  }
  await mongoose.connection.transaction((session) =>
    saveEventLayout(
      event,
      { canvas_width: 1000, canvas_height: 650, version: 0, objects },
      session,
    ),
  );
  const app = express();
  app.use('/v1/bk', require('../src/routes/bk.routes'));
  server = app.listen(5101, '127.0.0.1', () =>
    console.log(
      'Disposable booking preview API: http://127.0.0.1:5101; login preview@example.test / Preview-only-593!',
    ),
  );
}
async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
main().catch(async (error) => {
  console.error(error.message);
  await stop();
});
