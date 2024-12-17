import { query, sqlAnd, sqlFmt, sqlIn } from "../../db/index.js";
import { isEmpty } from "wsp-toolkit";

export async function queryTag({ idIn, name }) {
  let text = `SELECT id, name FROM media_center.video_tag`;
  const conditions = [];
  if (!isEmpty(idIn)) {
    conditions.push(sqlIn("id", idIn));
  }
  if (typeof name === "string") {
    conditions.push(sqlFmt(`name like '%%%L%%'`, name));
  }
  if (conditions.length > 0) {
    text += ` WHERE ${sqlAnd(conditions)}`;
  }
  const { rows } = await query(text);
  return rows;
}
