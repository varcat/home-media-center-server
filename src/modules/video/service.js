import fs from "node:fs";
import path from "node:path";
import {
  query,
  Sql,
  sqlAnd,
  sqlFmt,
  sqlIn,
  sqlLike,
  transaction,
} from "../../db/index.js";
import { genId, toNginxUrl } from "../../utils/index.js";
import { isEmpty, typeOf } from "wsp-toolkit";
import { queryTag } from "../tag/dao.js";

export const getVideoList = {
  schema: {
    body: {
      type: "object",
      properties: {
        offset: { type: "integer" },
        limit: { type: "integer" },
        title: { type: "string" },
        tags: { type: "array", items: { type: "integer" } },
        releaseDate: { type: "integer" },
      },
    },
  },
  async handler(req, reply) {
    const { offset, limit, tags, title, releaseDate } = req.body;
    const hasTag = !isEmpty(tags);

    const conditions = [
      sqlLike("v.title", title),
      releaseDate && sqlFmt("v.release_year = %L", releaseDate),
      hasTag
        ? `EXISTS(${Sql.of(["relation_video_tag", "r"]).select("id").and("r.video_id = v.id").and(sqlIn("r.tag_id", tags))}})`
        : null,
    ];

    const { rows: videos } = await query(
      Sql.of(["video", "v"])
        .select("v.id", "v.title", "v.release_year", "v.cover_img", "v.path")
        .andAll(...conditions)
        .offset(offset)
        .limit(limit),
    );
    const { rows: videoCont } = await query(
      Sql.of(["video", "v"])
        .andAll(...conditions)
        .count(),
    );
    if (isEmpty(videos)) {
      return { ok: true, data: [] };
    }
    const { rows: relations } = await query(
      `SELECT tag_id, video_id FROM relation_video_tag WHERE ${sqlIn(
        "video_id",
        videos.map((x) => x.id),
      )}`,
    );

    const tagList = await queryTag({ idIn: relations.map((x) => x.tag_id) });
    const tagMap = tagList.reduce((res, tag) => {
      res[tag.id] = {
        id: tag.id,
        name: tag.name,
      };
      return res;
    }, {});
    const rows = videos.map((v) => {
      return {
        id: v.id,
        title: v.title,
        releaseDate: v.release_year,
        coverImg: toNginxUrl(v.path, v.cover_img),
        tags: relations.reduce((res, r) => {
          if (r.video_id === v.id) {
            const tag = tagMap[r.tag_id];
            res.push(tag);
          }
          return res;
        }, []),
      };
    });

    return {
      ok: true,
      data: {
        rows,
        total: videoCont[0].count,
      },
    };
  },
};

export const addVideoOpts = {
  schema: {
    body: {
      type: "object",
      required: ["title", "dirPath", "coverImgName", "releaseDate"],
      properties: {
        title: { type: "string" },
        dirPath: { type: "string" },
        coverImgName: { type: "string" },
        releaseDate: { type: "integer", minimum: 1900, maximum: 2099 },
        tags: { type: "array", uniqueItems: true, items: { type: "integer" } },
      },
    },
  },
  async handler(req, reply) {
    const { title, dirPath, coverImgName, releaseDate, tags } = req.body;

    let statInfo;
    try {
      statInfo = fs.statSync(dirPath);
      if (!statInfo.isDirectory()) {
        throw 0;
      }
    } catch (e) {
      reply.send({
        ok: false,
        msg: `dirPath 目录不正确或不存在`,
      });
      return;
    }

    const { base } = path.parse(dirPath);
    const { rows: countInfo } = await query(
      Sql.of("video").count().and(sqlFmt("path = %L", base)),
    );
    if (countInfo?.[0]?.count > 0) {
      reply.send({
        ok: false,
        msg: `dirPath 目录不正确,已在数据库中存有`,
      });
      return;
    }

    const dirName = genId();
    await transaction(async (db) => {
      const { rows } = await db.query(
        `insert into video (title, release_year, cover_img, path) values ($1,$2,$3,$4) returning id`,
        [title, releaseDate, coverImgName, dirName],
      );
      if (Array.isArray(tags)) {
        const videoId = rows[0].id;
        const values = tags
          .map((tagId) => sqlFmt("(%s, %L)", videoId, tagId))
          .join(",");
        await db.query(
          `insert into relation_video_tag (video_id, tag_id) VALUES ${values}`,
        );
      }
      fs.renameSync(dirPath, path.resolve(process.env.video_dir, dirName));
    });
    return { ok: true };
  },
};

export const deleteVideoOpts = {
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
        Sql.of("video").delete().and(sqlFmt("id = %L", id)).toString(),
      );
      await db.query(
        Sql.of("relation_video_tag")
          .delete()
          .and("video_id = %L", id)
          .toString(),
      );
    });
    return { ok: true };
  },
};
