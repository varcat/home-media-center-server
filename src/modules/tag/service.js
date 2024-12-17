import { query, Sql, sqlFmt } from "../../db/index.js";

export async function getTags() {
  const res = await query(Sql.of("video_tag").select("id", "name"));
  return {
    ok: true,
    data: res.rows,
  };
}

async function checkExistTag(name, id) {
  const text =
    `select count(id) as count from media_center.video_tag where name = ${sqlFmt("%L", name)}` +
    (id ? ` and id != ${sqlFmt("%L::int", id)}` : "");
  const res = await query(text);
  return res.rows[0].count > 0;
}

export const addOrEditTag = {
  schema: {
    body: {
      type: "object",
      required: ["name"],
      properties: {
        id: { type: "integer" },
        name: { type: "string", minLength: 1 },
      },
    },
  },
  handler: async (req, reply) => {
    const { id, name } = req.body;
    if (await checkExistTag(name, id)) {
      reply.send({
        ok: false,
        msg: "name 已存在",
      });
      return;
    }

    let pgRes;
    if (id) {
      pgRes = await query(
        "update media_center.video_tag set name = $1::text where id = $2::int returning id",
        [name, id],
      );
    } else {
      pgRes = await query(
        Sql.of("video_tag").insertOne({
          name,
        }),
      );
    }
    reply.send({
      ok: true,
      data: pgRes.rows[0],
    });
  },
};

export const deleteTag = {
  schema: {
    body: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "integer" },
      },
    },
  },
  async handler(req) {
    const { id } = req.body;
    await query(Sql.of("video_tag").delete().and(sqlFmt("id = %L", id)));
    return { ok: true };
  },
};
