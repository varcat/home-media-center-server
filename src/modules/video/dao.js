import { query, Sql, sqlEq, sqlFmt, sqlIn, sqlLike } from "../../db/index.js";
import { isEmpty } from "wsp-toolkit";
import { queryTag } from "../tag/dao.js";
import { toNginxUrl } from "../../utils/index.js";

export async function queryVideo({
  idList,
  tagIdList,
  title,
  releaseDate,
  offset,
  limit,
} = {}) {
  const hasTag = Array.isArray(tagIdList) && !isEmpty(tagIdList);
  const hasId = Array.isArray(idList) && !isEmpty(idList);

  const tagSql = hasTag
    ? `EXISTS(${Sql.of(["relation_video_tag", "r"]).select("id").and("r.video_id = v.id").and(sqlIn("r.tag_id", tagIdList))}})`
    : null;

  const conditions = [
    sqlLike("v.title", title),
    sqlEq("v.release_year", releaseDate),
    tagSql,
    hasId ? sqlIn("v.id", idList) : null,
  ];

  const { rows: videos } = await query(
    Sql.of(["video", "v"])
      .select(
        "v.id",
        "v.title",
        ["v.release_year", "releaseDate"],
        ["v.cover_img", "coverImg"],
        "v.path",
        "v.content",
      )
      .andAll(...conditions)
      .offset(offset)
      .limit(limit),
  );
  const { rows: rowsCount } = await query(
    Sql.of(["video", "v"])
      .andAll(...conditions)
      .count(),
  );
  if (isEmpty(videos)) {
    return { rows: [], count: 0 };
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
      ...v,
      coverImg: toNginxUrl(v.path, v.coverImg),
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
    rows,
    count: rowsCount[0].count,
  };
}
