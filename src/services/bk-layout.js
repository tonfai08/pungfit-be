const {
  models,
  z,
  objectId,
  text,
  integer,
  requireValue,
  mongoose,
} = require('./bk-common');

const objectInput = z
  .object({
    _id: objectId,
    parent_object_id: objectId.nullable().optional(),
    kind: z.enum(['table', 'chair', 'stage', 'entrance', 'text']),
    label: text(100).default(''),
    x: z.number().finite().min(0),
    y: z.number().finite().min(0),
    width: z.number().finite().min(1).max(5000),
    height: z.number().finite().min(1).max(5000),
    rotation: z.number().min(0).max(359.999).default(0),
    z_index: integer().default(0),
    properties_json: z
      .object({
        shape: z.enum(['round', 'rect']).default('round'),
        capacity: integer(1).max(100).default(4),
      })
      .default({ shape: 'round', capacity: 4 }),
    table_type_id: objectId.nullable().optional(),
    zone: text(100).default(''),
    is_bookable: z.boolean().default(true),
  })
  .strict();
const layoutInput = z
  .object({
    name: text().min(1).optional(),
    description: text(2000).optional(),
    canvas_width: integer(100).max(5000),
    canvas_height: integer(100).max(5000),
    version: integer().default(0),
    objects: z.array(objectInput).max(1000),
  })
  .strict();

function validateLayout(input) {
  const objects = new Map(input.objects.map((object) => [object._id, object]));
  requireValue(objects.size === input.objects.length, 'ID วัตถุซ้ำ');
  const codes = new Set();
  for (const object of input.objects) {
    requireValue(
      object.x + object.width <= input.canvas_width &&
        object.y + object.height <= input.canvas_height,
      'วัตถุต้องอยู่ภายในผัง',
    );
    if (object.parent_object_id) {
      const parent = objects.get(object.parent_object_id);
      requireValue(
        object.kind === 'chair' && parent?.kind === 'table',
        'เก้าอี้ต้องอยู่กับโต๊ะในผังเดียวกัน',
      );
    }
    if (object.kind === 'table') {
      const code = object.label.trim().toUpperCase();
      requireValue(
        code.length > 0 && code.length <= 50 && !codes.has(code),
        'รหัสโต๊ะต้องไม่ว่างหรือซ้ำ',
      );
      codes.add(code);
    }
  }
}
function canvasRecord(object) {
  const { table_type_id, zone, is_bookable, ...record } = object;
  return record;
}
async function readEventLayout(eventId, session) {
  const layout = await models.bk_event_layouts
    .findOne({ event_id: eventId })
    .session(session || null)
    .lean();
  if (!layout)
    return { canvas_width: 1000, canvas_height: 700, version: 0, objects: [] };
  const objects = await models.bk_event_layout_objects
    .find({ event_layout_id: layout._id })
    .session(session || null)
    .sort({ z_index: 1 })
    .lean();
  const tables = await models.bk_event_tables
    .find({ event_id: eventId })
    .session(session || null)
    .lean();
  const tableMap = new Map(
    tables.map((table) => [String(table.layout_object_id), table]),
  );
  return {
    ...layout,
    objects: objects.map((object) => ({
      ...object,
      table_type_id: tableMap.get(String(object._id))?.table_type_id || null,
      zone: tableMap.get(String(object._id))?.zone || '',
      is_bookable: tableMap.get(String(object._id))?.is_bookable ?? true,
    })),
  };
}
async function saveEventLayout(event, input, session) {
  validateLayout(input);
  let layout = await models.bk_event_layouts
    .findOne({ event_id: event._id })
    .session(session);
  requireValue(
    (layout?.version || 0) === input.version,
    'ผังถูกแก้ไขแล้ว กรุณาโหลดใหม่',
    409,
  );
  if (!layout) layout = new models.bk_event_layouts({ event_id: event._id });
  layout.canvas_width = input.canvas_width;
  layout.canvas_height = input.canvas_height;
  layout.increment();
  await layout.save({ session });
  const existing = await models.bk_event_tables
    .find({ event_id: event._id })
    .session(session);
  const nextTables = input.objects.filter((object) => object.kind === 'table');
  const hasBookings = await models.bk_bookings
    .exists({
      event_id: event._id,
      status: { $in: ['pending_payment', 'payment_review', 'confirmed'] },
    })
    .session(session);
  for (const table of existing) {
    const next = nextTables.find(
      (object) => object._id === String(table.layout_object_id),
    );
    if (
      !next ||
      next.table_type_id !== String(table.table_type_id) ||
      next.is_bookable !== table.is_bookable
    ) {
      requireValue(
        !hasBookings,
        'มีการจองอยู่: เปลี่ยนประเภท ปิด หรือลบโต๊ะไม่ได้ ให้ย้ายตำแหน่งได้เท่านั้น',
        409,
      );
      requireValue(
        !(await models.bk_table_assignments
          .exists({ event_table_id: table._id })
          .session(session)),
        'โต๊ะนี้มีประวัติการจัดโต๊ะแล้ว ลบหรือเปลี่ยนประเภทไม่ได้',
        409,
      );
    }
  }
  const types = await models.bk_event_table_types
    .find({ event_id: event._id })
    .session(session);
  const typeMap = new Map(types.map((type) => [String(type._id), type]));
  for (const object of nextTables)
    requireValue(
      typeMap.has(object.table_type_id),
      'กรุณาเลือกประเภทโต๊ะของงานนี้',
    );
  // Existing IDs may only belong to this layout. Replacing other layouts is never allowed.
  await models.bk_event_layout_objects.deleteMany(
    { event_layout_id: layout._id },
    { session },
  );
  for (const object of input.objects)
    await models.bk_event_layout_objects.create(
      [{ ...canvasRecord(object), event_layout_id: layout._id }],
      { session },
    );
  for (const old of existing)
    if (
      !nextTables.some((object) => object._id === String(old.layout_object_id))
    )
      await old.deleteOne({ session });
  for (const object of nextTables) {
    let table = existing.find(
      (item) => String(item.layout_object_id) === object._id,
    );
    if (!table)
      table = new models.bk_event_tables({
        event_id: event._id,
        layout_object_id: object._id,
      });
    table.set({
      table_type_id: object.table_type_id,
      code: object.label,
      zone: object.zone,
      is_bookable: object.is_bookable,
    });
    await table.save({ session });
  }
  return readEventLayout(String(event._id), session);
}
async function copyTemplate(event, templateId, session) {
  requireValue(
    !(await models.bk_event_layouts
      .exists({ event_id: event._id })
      .session(session)),
    'งานนี้มีผังแล้ว กรุณาแก้ไขผังเดิม',
    409,
  );
  const template = await models.bk_layout_templates
    .findById(templateId)
    .session(session);
  requireValue(template, 'ไม่พบแม่แบบ', 404);
  const objects = await models.bk_template_objects
    .find({ template_id: templateId })
    .session(session)
    .lean();
  const ids = new Map(
    objects.map((object) => [
      String(object._id),
      new mongoose.Types.ObjectId().toString(),
    ]),
  );
  const types = new Map();
  const inputs = [];
  for (const object of objects) {
    const capacity = object.properties_json?.capacity || 4;
    if (object.kind === 'table' && !types.has(capacity)) {
      let type = await models.bk_event_table_types
        .findOne({ event_id: event._id, name: `โต๊ะ ${capacity} คน` })
        .session(session);
      if (!type)
        [type] = await models.bk_event_table_types.create(
          [
            {
              event_id: event._id,
              name: `โต๊ะ ${capacity} คน`,
              capacity,
              price_satang: 0,
            },
          ],
          { session },
        );
      types.set(capacity, String(type._id));
    }
    inputs.push({
      _id: ids.get(String(object._id)),
      kind: object.kind,
      label: object.label,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation,
      z_index: object.z_index,
      parent_object_id: ids.get(String(object.parent_object_id)) || null,
      properties_json: object.properties_json,
      table_type_id: object.kind === 'table' ? types.get(capacity) : null,
      is_bookable: true,
      zone: '',
    });
  }
  const result = await saveEventLayout(
    event,
    {
      canvas_width: template.canvas_width,
      canvas_height: template.canvas_height,
      version: 0,
      objects: inputs,
    },
    session,
  );
  await models.bk_event_layouts.updateOne(
    { event_id: event._id },
    { $set: { source_template_id: template._id } },
    { session },
  );
  return result;
}
module.exports = {
  layoutInput,
  validateLayout,
  canvasRecord,
  readEventLayout,
  saveEventLayout,
  copyTemplate,
};
