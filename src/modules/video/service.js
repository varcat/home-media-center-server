import fs from "node:fs";
import path from "node:path";
import childProcess from "node:child_process";
import { query, Sql, sqlFmt, transaction } from "../../db/index.js";
import { genId, isVideo, toNginxUrl } from "../../utils/index.js";
import { queryVideo } from "./dao.js";
import * as os from "node:os";

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
    const { rows, count } = await queryVideo({
      offset,
      limit,
      title,
      tagIdList: tags,
      releaseDate,
    });

    return {
      ok: true,
      data: {
        rows,
        total: count,
      },
    };
  },
};

const genVideoBodySchema = (isUpdate = false) => {
  const required = ["title", "dirPath", "coverImgName", "releaseDate"];
  const properties = {
    title: { type: "string" },
    dirPath: { type: "string" },
    coverImgName: { type: "string" },
    releaseDate: { type: "integer", minimum: 1900, maximum: 2099 },
    content: { type: "string" },
    tags: { type: "array", uniqueItems: true, items: { type: "integer" } },
  };

  if (isUpdate) {
    required.push("id");
    properties.id = {
      type: "integer",
    };
  }

  return {
    type: "object",
    required,
    properties,
  };
};

export const addVideoOpts = {
  schema: {
    body: genVideoBodySchema(),
  },
  async handler(req, reply) {
    const { title, dirPath, coverImgName, releaseDate, tags, content } =
      req.body;

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
        Sql.of("video")
          .insertOne({
            title,
            release_year: releaseDate,
            cover_img: coverImgName,
            path: dirName,
            content,
          })
          .toString(),
      );
      if (Array.isArray(tags)) {
        const videoId = rows[0].id;
        const values = tags.map((tagId) => [videoId, tagId]);
        await db.query(
          Sql.of("relation_video_tag")
            .insert("video_id", "tag_id")
            .values(...values)
            .toString(),
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
      required: ["id", "path"],
      properties: {
        id: { type: "integer" },
        path: { type: "string" },
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
    fs.rmdirSync(path.resolve(process.env.video_dir, req.body.path), {
      recursive: true,
    });
    return { ok: true };
  },
};

export const getVideoOpts = {
  schema: {
    params: {
      type: "object",
      required: ["vid"],
      properties: {
        vid: {
          type: "integer",
          minimum: 1,
        },
      },
    },
  },
  async handler(req, reply) {
    const { vid } = req.params;
    const { rows } = await queryVideo({ idList: [vid] });
    const data = rows[0];

    const processDir = (fileNameList) => {
      return fileNameList.reduce((res, fileName) => {
        if (isVideo(fileName)) {
          const name = path.parse(fileName).name;
          res.push({
            id: name,
            name,
            link: toNginxUrl(data.path, fileName),
          });
        }
        return res;
      }, []);
    };

    data.episodeList = processDir(
      fs.readdirSync(path.resolve(process.env.video_dir, data.path)),
    );

    return { ok: true, data };
  },
};

export const getVideoEditDataOpts = {
  schema: {
    query: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "integer",
        },
      },
    },
  },
  async handler(req) {
    const { id } = req.query;
    const { rows } = await queryVideo({
      idList: [id],
    });
    const data = rows[0];
    data.coverImg = path.basename(data.coverImg);
    return {
      ok: true,
      data,
    };
  },
};

export const updateVideoOpts = {
  schema: {
    body: genVideoBodySchema(true),
  },
  async handler(req) {
    Sql.of("video").update();
  },
};

export const openDirOpts = {
  schema: {
    body: {
      type: "object",
      required: ["path"],
      properties: {
        path: {
          type: "string",
        },
      },
    },
  },
  async handler(req) {
    if (os.type() === "Windows_NT") {
      childProcess.exec(
        `ii ${path.resolve(process.env.video_dir, req.body.path)}`,
      );
    } else {
      childProcess.exec(
        `open ${path.resolve(process.env.video_dir, req.body.path)}`,
      );
    }
    return {
      ok: true,
      data: os.type(),
    };
  },
};
