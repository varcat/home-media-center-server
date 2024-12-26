import fs from "node:fs";
import path from "node:path";
import { parseTOML } from "confbox";
import { addOrEditTag, getTags, deleteTag } from "../modules/tag/service.js";
import {
  addVideoOpts,
  deleteVideoOpts,
  getVideoList,
  getVideoOpts,
  getVideoEditDataOpts,
  updateVideoOpts,
  openDirOpts,
} from "../modules/video/service.js";
import { Sql, sqlFmt } from "../db/index.js";

function testSql(req) {
  return Sql.of("user_ac").and("id = 1").toString();
}

export default async function (fastify, opts) {
  fastify.get("/test/sql", testSql);

  fastify.post("/tag/addOrEdit", addOrEditTag);
  fastify.get("/tag/list", getTags);
  fastify.post("/tag/delete", deleteTag);

  fastify.post("/video/list", getVideoList);
  fastify.post("/video/add", addVideoOpts);
  fastify.post("/video/delete", deleteVideoOpts);
  fastify.post("/video/update", updateVideoOpts);
  fastify.post("/video/openDir", openDirOpts);
  fastify.get("/video/:vid", getVideoOpts);
  fastify.get("/video/editData", getVideoEditDataOpts);
}
