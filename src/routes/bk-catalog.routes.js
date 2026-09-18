const express = require('express');
const sanitizeHtml = require('sanitize-html');
const {
  models,
  mongoose,
  z,
  objectId,
  text,
  integer,
  date,
  requireValue,
  audit,
  withEvent,
  findOrFail,
} = require('../services/bk-common');
const {
  layoutInput,
  validateLayout,
  canvasRecord,
  readEventLayout,
  saveEventLayout,
  copyTemplate,
} = require('../services/bk-layout');
const router = express.Router();
const { reservedAttendees } = require('../services/bk-booking');
const optionalDate = date.nullable().optional();
const eventInput = z
  .object({
    name: text().min(1),
    slug: text(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    short_description: text(1000).optional(),
    content_html: z.string().max(200000).optional(),
    cover_file_id: objectId.nullable().optional(),
    poster_file_id: objectId.nullable().optional(),
    venue_name: text().optional(),
    venue_address: text(2000).optional(),
    map_url: z.union([z.literal(''), z.url().regex(/^https?:\/\//)]).optional(),
    starts_at: optionalDate,
    ends_at: optionalDate,
    publish_at: optionalDate,
    booking_opens_at: optionalDate,
    booking_closes_at: optionalDate,
    hide_at: optionalDate,
    timezone: text(100).optional(),
    status: z.enum(['draft', 'scheduled', 'cancelled', 'archived']).optional(),
    table_selection_mode: z
      .enum(['customer_select', 'admin_assign'])
      .optional(),
    waitlist_enabled: z.boolean().optional(),
    payment_required: z.boolean().optional(),
    booking_mode: z.enum(['table', 'capacity']).optional(),
    capacity_limit: integer(1).optional(),
    max_attendees_per_booking: integer(1).optional(),
    price_per_attendee_satang: integer().optional(),
    payment_due_minutes: integer(1).max(10080).optional(),
    payment_instructions: text(10000).optional(),
    booking_terms: text(20000).optional(),
  })
  .strict();
function cleanContent(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'img',
      's', 'span', 'hr', 'pre', 'code', 'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'rel', 'target'], img: ['src', 'alt', 'title', 'width'],
      p: ['style'], h2: ['style'], h3: ['style'], span: ['style'],
      figure: ['class'], ol: ['start'],
      th: ['colspan', 'rowspan', 'colwidth'], td: ['colspan', 'rowspan', 'colwidth'],
    },
    allowedClasses: { figure: ['bk-article-image'] },
    allowedStyles: {
      '*': {
        'color': [/^#[a-f\d]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
        'background-color': [/^#[a-f\d]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
        'text-align': [/^(left|center|right|justify)$/],
      },
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
      img: (tagName, attribs) => {
        const width = Number(attribs.width);
        if (!Number.isInteger(width) || width < 50 || width > 2400) delete attribs.width;
        return { tagName, attribs };
      },
      '*': (tagName, attribs) => {
        if (tagName === 'td' || tagName === 'th') {
          for (const name of ['colspan', 'rowspan']) {
            if (!/^[1-9]\d{0,2}$/.test(attribs[name] || '')) delete attribs[name];
          }
          if (!/^\d{1,4}(,\d{1,4})*$/.test(attribs.colwidth || '')) delete attribs.colwidth;
        }
        return { tagName, attribs };
      },
    },
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^\/bk-api\/files\/[a-f\d]{24}$/i.test(frame.attribs.src || ''),
  });
}
async function eventFields(input, session) {
  const { content_html, ...fields } = input;
  if (content_html !== undefined)
    fields.content_json = { html: cleanContent(content_html) };
  for (const fileId of [fields.cover_file_id, fields.poster_file_id].filter(
    Boolean,
  ))
    await findOrFail(models.bk_files, { _id: fileId }, session);
  return fields;
}
router.get('/events', async (req, res) =>
  res.json(await models.bk_events.find({ deleted_at: null }).sort({ created_at: -1 }).limit(200)),
);
router.post('/events', async (req, res) => {
  const input = eventInput.parse(req.body);
  const event = await mongoose.connection.transaction(async (session) => {
    const [created] = await models.bk_events.create(
      [{ ...(await eventFields(input, session)), created_by: req.bkUser._id }],
      { session },
    );
    await audit(req.bkUser, 'create_event', created, created._id, session);
    return created;
  });
  res.status(201).json(event);
});
router.get('/events/:id', async (req, res) => {
  objectId.parse(req.params.id);
  res.json(await findOrFail(models.bk_events, { _id: req.params.id }));
});
router.patch('/events/:id', async (req, res) => {
  const input = eventInput.partial().parse(req.body);
  res.json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'update_event',
      async (event, session) => {
        requireValue(!input.booking_mode || input.booking_mode === (event.booking_mode || 'table'),
          'เปลี่ยนรูปแบบการจองไม่ได้หลังสร้าง Event กรุณาสร้างงานใหม่', 409);
        if ((input.booking_mode || event.booking_mode) === 'capacity' && input.capacity_limit !== undefined)
          requireValue(input.capacity_limit >= await reservedAttendees(event._id, session), 'ลดโควตาต่ำกว่าจำนวนที่จองแล้วไม่ได้', 409);
        if (['cancelled', 'archived'].includes(input.status)) {
          requireValue(
            !(await models.bk_bookings
              .exists({
                event_id: event._id,
                status: {
                  $in: ['pending_payment', 'payment_review', 'confirmed'],
                },
              })
              .session(session)),
            'กรุณาจัดการรายการจองที่ยังมีผลก่อนยกเลิกหรือเก็บงาน',
            409,
          );
        }
        event.set(await eventFields(input, session));
        await event.save({ session });
        return event;
      },
    ),
  );
});
router.delete('/events/:id', async (req, res) => {
  await withEvent(req.params.id, req.bkUser, 'delete_event', async (event, session) => {
    const bookings = await models.bk_bookings.exists({ event_id: event._id,
      status: { $in: ['pending_payment', 'payment_review', 'confirmed'] } }).session(session);
    const waiting = await models.bk_waitlist_entries.exists({ event_id: event._id,
      status: { $in: ['waiting', 'contacted', 'offered'] } }).session(session);
    requireValue(!bookings && !waiting, 'กรุณาจัดการรายการจองและรายชื่อสำรองที่ยังมีผลก่อนลบ Event', 409);
    event.deleted_at = new Date();
    event.deleted_by = req.bkUser._id;
    await event.save({ session });
  });
  res.json({ deleted: true });
});
router.get('/events/:id/table-types', async (req, res) => {
  objectId.parse(req.params.id);
  res.json(
    await models.bk_event_table_types
      .find({ event_id: req.params.id })
      .sort({ sort_order: 1 }),
  );
});
const tableTypeInput = z
  .object({
    name: text(100).min(1),
    capacity: integer(1).max(100),
    price_satang: integer(),
    max_tables_per_booking: integer(1).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
router.post('/events/:id/table-types', async (req, res) => {
  const input = tableTypeInput.parse(req.body);
  res.status(201).json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'create_table_type',
      async (event, session) => {
        const [type] = await models.bk_event_table_types.create(
          [{ ...input, event_id: event._id }],
          { session },
        );
        return type;
      },
    ),
  );
});
router.patch('/events/:id/table-types/:typeId', async (req, res) => {
  objectId.parse(req.params.typeId);
  const input = tableTypeInput.partial().parse(req.body);
  res.json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'update_table_type',
      async (event, session) => {
        const type = await findOrFail(
          models.bk_event_table_types,
          { _id: req.params.typeId, event_id: event._id },
          session,
        );
        if (input.capacity !== undefined && input.capacity !== type.capacity)
          requireValue(
            !(await models.bk_booking_items
              .exists({ table_type_id: type._id })
              .session(session)),
            'ประเภทนี้มีประวัติการจองแล้ว เปลี่ยนจำนวนที่นั่งไม่ได้',
            409,
          );
        type.set(input);
        await type.save({ session });
        return type;
      },
    ),
  );
});
router.get('/events/:id/layout', async (req, res) => {
  objectId.parse(req.params.id);
  res.json(await readEventLayout(req.params.id));
});
router.put('/events/:id/layout', async (req, res) => {
  const input = layoutInput.parse(req.body);
  res.json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'save_event_layout',
      (event, session) => saveEventLayout(event, input, session),
    ),
  );
});
router.post('/events/:id/copy-template', async (req, res) => {
  const input = z.object({ template_id: objectId }).strict().parse(req.body);
  res.json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'copy_template',
      (event, session) => copyTemplate(event, input.template_id, session),
    ),
  );
});
router.get('/templates', async (req, res) =>
  res.json(
    await models.bk_layout_templates.find().sort({ created_at: -1 }).limit(200),
  ),
);
router.get('/templates/:id', async (req, res) => {
  objectId.parse(req.params.id);
  const template = await findOrFail(models.bk_layout_templates, {
    _id: req.params.id,
  });
  const objects = await models.bk_template_objects
    .find({ template_id: template._id })
    .sort({ z_index: 1 });
  res.json({ ...template.toObject(), version: template.__v, objects });
});
async function saveTemplate(req, res) {
  const input = layoutInput.parse(req.body);
  requireValue(input.name, 'กรุณาระบุชื่อแม่แบบ');
  validateLayout(input);
  const template = await mongoose.connection.transaction(async (session) => {
    let target;
    if (req.params.id) {
      objectId.parse(req.params.id);
      target = await findOrFail(
        models.bk_layout_templates,
        { _id: req.params.id },
        session,
      );
      requireValue(
        target.__v === input.version,
        'แม่แบบถูกแก้ไขแล้ว กรุณาโหลดใหม่',
        409,
      );
    } else
      target = new models.bk_layout_templates({ created_by: req.bkUser._id });
    target.set({
      name: input.name,
      description: input.description,
      canvas_width: input.canvas_width,
      canvas_height: input.canvas_height,
    });
    target.increment();
    await target.save({ session });
    await models.bk_template_objects.deleteMany(
      { template_id: target._id },
      { session },
    );
    for (const object of input.objects)
      await models.bk_template_objects.create(
        [{ ...canvasRecord(object), template_id: target._id }],
        { session },
      );
    await audit(req.bkUser, 'save_template', target, null, session);
    return {
      ...target.toObject(),
      version: target.__v,
      objects: input.objects.map(canvasRecord),
    };
  });
  res.json(template);
}
router.post('/templates', saveTemplate);
router.put('/templates/:id', saveTemplate);
router.get('/audit', async (req, res) =>
  res.json(
    await models.bk_audit_logs
      .find()
      .sort({ created_at: -1 })
      .limit(100)
      .populate('actor_id', 'display_name'),
  ),
);
module.exports = { router, cleanContent };
