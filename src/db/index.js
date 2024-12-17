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

export const query = async (text, params) => {
  if (text instanceof Sql) {
    text = text.toString();
  }
  return pg.query(text, params);
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

export class Sql {
  #text = "SELECT 'emm' AS emm;";
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
    this.#tableName = tableName;
    this.#tableNameAlias = alias;
  }

  static of(name) {
    return new Sql(name);
  }

  select(...colNameList) {
    this.#operation = "select";
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
    this.#operation = "insert";
    this.#colNameList = colNameList;
    return this;
  }

  delete() {
    this.#operation = "delete";
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
    this.#insertValues.push(
      ...xs.map((row) => {
        return `(${row.map((v) => sqlFmt("%L", v)).join(",")})`;
      }),
    );
    return this;
  }

  and(...conditions) {
    this.#andConditions.push(...conditions.filter(isExist));
    return this;
  }

  or(...conditions) {
    this.#orConditions.push(...conditions.filter(isExist));
    return this;
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
      case "select":
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
      case "insert":
        if (isEmpty(this.#insertValues)) break;
        const fields = this.#colNameList.join(",");
        text = `INSERT INTO ${this.#tableName} (${fields}) VALUES ${this.#insertValues.join(",")} RETURNING ${fields};`;
        break;
      case "delete":
        if (isEmpty(where)) break;
        text = `DELETE FROM ${this.#tableName} WHERE ${where};`;
    }

    return text;
  }
}
