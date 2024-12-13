const fs = require("node:fs");
const path = require("node:path");
const { parseTOML } = require("confbox");
const { addTag, getTagList } = require("../../services/videoTag");

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

module.exports = async function (fastify, opts) {
  fastify.post("/video/addTag", addTag);
  fastify.post("/video/getTagList", getTagList);
  fastify.get("/videos", async function (request, reply) {
    const dirList = process.env.video_dir.split(",");
    const result = readDirList(dirList);
    return result;
  });

  fastify.get("/video/:vid", async (request, reply) => {
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
  });
};

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
