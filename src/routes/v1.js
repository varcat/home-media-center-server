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
} from "../modules/video/service.js";
import { Sql, sqlFmt } from "../db/index.js";

function testSql(req) {
  return Sql.of("user_ac").and("id = 1").toString();
}

const videoExtensions = [
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".wmv",
  ".flv",
  ".mpeg",
  ".mpg",
  ".ts",
]; // Add more as needed

const videoIdDirMap = new Map();

const VIDEO_PATH_BASE = "videos";

export default async function (fastify, opts) {
  fastify.get("/test/sql", testSql);

  fastify.post("/tag/addOrEdit", addOrEditTag);
  fastify.get("/tag/list", getTags);
  fastify.post("/tag/delete", deleteTag);

  fastify.post("/video/list", getVideoList);
  fastify.post("/video/add", addVideoOpts);
  fastify.post("/video/delete", deleteVideoOpts);
  fastify.post("/video/update", updateVideoOpts);
  fastify.get("/video/:vid", getVideoOpts);
  fastify.get("/video/editData", getVideoEditDataOpts);
}

async function t(request, reply) {
  const { vid } = request.params;
  let vidPath = videoIdDirMap.get(vid);
  if (!vidPath) {
    initVideoIdDirMap();
  }
  vidPath = videoIdDirMap.get(vid);
  if (!vidPath) {
    reply.code(404);
    return `无当前vid: ${vid} 的视频`;
  }

  return getEpisodes(vidPath, vid);
}

function initVideoIdDirMap() {
  const dirList = process.env.video_dir.split(",");
  dirList.forEach((dir) => {
    const pathList = fs.readdirSync(dir, {
      encoding: "utf8",
    });
    pathList.forEach((vid) => {
      videoIdDirMap.set(vid, path.resolve(dir, vid));
    });
  });
}

function readDirList(dirList) {
  return dirList
    .map((dir) => {
      const pathList = fs.readdirSync(dir, {
        encoding: "utf8",
      });

      const result = [];
      pathList.forEach((vid) => {
        const curPath = path.resolve(dir, vid);

        const infoFile = path.resolve(curPath, process.env.video_info_file);
        if (!fs.existsSync(infoFile)) return;

        videoIdDirMap.set(vid, curPath);

        const info = processVideoInfo(infoFile, vid);
        result.push(info);
      });
      return result;
    })
    .flat(Infinity);
}

function processVideoInfo(infoFile, vid) {
  const info = parseTOML(fs.readFileSync(infoFile, { encoding: "utf8" }));
  return {
    vid,
    title: info.title,
    releaseDate: info.release_date,
    coverImg: info.cover_img
      ? path.join("/", VIDEO_PATH_BASE, vid, info.cover_img)
      : null,
  };
}

function getEpisodes(dir, vid) {
  const episodes = [];
  for (const x of fs.readdirSync(dir)) {
    // 暂不处理子目录,将来需要在修改
    if (fs.statSync(path.resolve(dir, x)).isDirectory()) return;

    const { ext, name } = path.parse(x);

    if (videoExtensions.includes(ext.toLowerCase())) {
      episodes.push({
        id: name,
        name: `${name}集`,
        link: path.join("/videos", vid, `${name}${ext}`),
      });
    }
  }
  return episodes;
}
