import pgsql from "pg";
import pgFormat from "pg-format";
import { isEmpty, isExist, isNil, isSafeNum } from "wsp-toolkit";
const { Pool } = pgsql;

export const pg = new Pool({
  connectionString:
    "postgres://postgres:1234@localhost:5432/postgres?options=-c%20search_path=postgres,media_center",
});

export const transaction = async (fn) => {
  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

export const query = async (text, params = [], { db = pg } = {}) => {
  if (text instanceof Sql) {
    text = text.toString();
  }
  return db.query(text, params);
};

export const sqlAnd = (conditions) => {
  if (isEmpty(conditions)) return "";
  const result = [];
  for (const x of conditions) {
    const res = typeof x === "function" ? x() : x;
    if (isNil(res) || isEmpty(res)) {
      continue;
    }
    result.push(res);
  }
  return result.join(" AND ");
};

export const sqlOr = (conditions) => {
  if (isEmpty(conditions)) return "";
  const result = [];
  for (const x of conditions) {
    const res = typeof x === "function" ? x() : x;
    if (isNil(res) || isEmpty(res)) {
      continue;
    }
    result.push(res);
  }
  return `(${result.join(" or ")})`;
};

export const sqlFmt = (fmt, ...args) => pgFormat(fmt, ...args);

export const sqlIn = (fieldName, list) => {
  return `${fieldName} IN (${sqlFmt(list.map((x) => "%L").join(","), ...list)})`;
};

export const sqlLike = (fieldName, val) => {
  if (isNil(val) || isEmpty(val)) return "";
  return sqlFmt(`%s like %L`, fieldName, `%${val}%`);
};

const SqlOp = {
  select: "select",
  delete: "delete",
  insert: "insert",
  count: "count",
};
export class Sql {
  #text = "";
  #tableName;
  #tableNameAlias;
  #andConditions = [];
  #orConditions = [];
  #colNameList = [];
  #offset;
  #limit;
  #operation;
  #insertValues = [];

  constructor(name) {
    let tableName, alias;
    if (typeof name === "string") {
      tableName = name;
    } else if (Array.isArray(name)) {
      tableName = name[0];
      alias = name[1];
    } else {
      throw new Error("name 不能为空");
    }
    this.#tableName = sqlFmt(`%I`, tableName);
    this.#tableNameAlias = alias;
  }

  static of(name) {
    return new Sql(name);
  }

  select(...colNameList) {
    this.#operation = SqlOp.select;
    this.#colNameList = colNameList.reduce((res, x) => {
      if (typeof x === "string") {
        res.push(x);
      } else if (Array.isArray(x)) {
        res.push(`${x[0]} AS "${x[1]}"`);
      }
      return res;
    }, []);
    return this;
  }

  insert(...colNameList) {
    this.#operation = SqlOp.insert;
    this.#colNameList = colNameList;
    return this;
  }

  delete() {
    this.#operation = SqlOp.delete;
    return this;
  }

  count() {
    this.#operation = SqlOp.count;
    return this;
  }

  insertOne(data) {
    const keys = [];
    const vals = [];
    for (const [k, v] of Object.entries(data)) {
      if (isNil(v)) continue;
      keys.push(k);
      vals.push(v);
    }
    this.insert(keys).values(vals);
    return this;
  }

  values(...xs) {
    this.#insertValues.push(...xs);
    return this;
  }

  where({ fmt, logic = "and" }, ...val) {
    const condition = sqlFmt(fmt, ...val);
    if (logic === "and") {
      this.#andConditions.push(condition);
    } else {
      this.#orConditions.push(condition);
    }
    return this;
  }

  andAll(...conditions) {
    conditions.filter(isExist).forEach((condition) => {
      this.and(condition);
    });
    return this;
  }

  and(fmt, ...val) {
    return this.where({ fmt, logic: "and" }, ...val);
  }

  or(fmt, ...val) {
    return this.where({ fmt, logic: "or" }, ...val);
  }

  offset(offset) {
    this.#offset = offset;
    return this;
  }

  limit(limit) {
    this.#limit = limit;
    return this;
  }

  toString() {
    let text = this.#text;

    const where = sqlAnd(this.#andConditions.concat(sqlOr(this.#orConditions)));

    switch (this.#operation) {
      case SqlOp.select:
        const cols = isEmpty(this.#colNameList)
          ? "*"
          : this.#colNameList.join(", ");
        const alias = this.#tableNameAlias ? ` AS ${this.#tableNameAlias}` : "";
        text = `SELECT ${cols} FROM ${this.#tableName}${alias}`;

        if (!isEmpty(where)) {
          text += ` WHERE ${where}`;
        }
        if (isExist(this.#offset)) {
          text += ` OFFSET ${this.#offset}`;
        }
        if (isExist(this.#limit)) {
          text += ` LIMIT ${this.#limit}`;
        }
        break;
      case SqlOp.insert:
        if (isEmpty(this.#insertValues)) break;
        const fields = this.#colNameList.join(",");
        const values = this.#insertValues.map((row) => {
          if (row.length !== this.#colNameList.length) {
            throw new Error(
              `粗心鬼，insert 的 columns.length 和 values.length 不相等`,
            );
          }
          return `(${row.map((v) => sqlFmt("%L", v)).join(",")})`;
        });

        text = `INSERT INTO ${this.#tableName} (${fields}) VALUES ${values.join(",")} RETURNING ${fields};`;
        break;
      case SqlOp.delete:
        if (isEmpty(where)) {
          throw new Error("怎么肥事？delete 语句没有 where 条件哦");
        }
        text = `DELETE FROM ${this.#tableName} WHERE ${where};`;
        break;
      case SqlOp.count:
        text = `SELECT count(1)::int AS count FROM ${this.#tableName}`;
        if (!isEmpty(where)) {
          text += ` WHERE ${where}`;
        }
        break;
      default:
        text = ``;
        break;
    }

    return text;
  }
}
