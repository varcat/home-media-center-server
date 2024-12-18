import { query, Sql, sqlFmt, transaction } from "../../db/index.js";
import { checkExistTag } from "./dao.js";

export async function getTags() {
  const res = await query(Sql.of("video_tag").select("id", "name"));
  return {
    ok: true,
    data: res.rows,
  };
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
    await transaction(async (db) => {
      await db.query(
        Sql.of("video_tag").delete().and(sqlFmt("id = %L", id)).toString(),
      );
      await db.query(
        Sql.of("relation_video_tag").delete().and(sqlFmt("tag_id = %L"), id),
      );
    });
    return { ok: true };
  },
};
