import { customAlphabet } from "nanoid";
import path from "node:path";

export const genId = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);

export function toNginxUrl(...dirs) {
  return [process.env.nginx_video_dir, ...dirs].join("/");
}
