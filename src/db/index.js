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

export const sqlEq = (field, val) => {
  if (val === undefined) return "";
  return sqlFmt("%s = %L", field, val);
};

const SqlOp = {
  select: "select",
  delete: "delete",
  insert: "insert",
  count: "count",
  update: "update",
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
  #values = [];

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

  update(data) {
    this.#operation = SqlOp.update;
    this.#colNameList = [];
    this.#values = [];
    const value = [];
    Object.entries(data).forEach(([k, v]) => {
      if (isNil(v)) return;
      this.#colNameList.push(k);
      value.push(v);
    });
    this.#values.push(value);
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
    this.insert(...keys).values(vals);
    return this;
  }

  values(...rowValue) {
    this.#values.push(...rowValue);
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
    this.where({ fmt, logic: "and" }, ...val);
    return this;
  }

  or(fmt, ...val) {
    this.where({ fmt, logic: "or" }, ...val);
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

    const getFields = () => this.#colNameList.join(",");
    const getValues = () =>
      this.#values
        .map((row) => {
          if (row.length !== this.#colNameList.length) {
            throw new Error(
              `粗心鬼，insert 的 columns.length 和 values.length 不相等`,
            );
          }
          return `(${row.map((v) => sqlFmt("%L", v)).join(",")})`;
        })
        .join(",");
    const where = sqlAnd(this.#andConditions.concat(sqlOr(this.#orConditions)));
    const tableName = this.#tableNameAlias
      ? sqlFmt("%I AS %I", this.#tableName, this.#tableNameAlias)
      : sqlFmt("%I", this.#tableName);

    switch (this.#operation) {
      case SqlOp.select:
        const cols = isEmpty(this.#colNameList)
          ? "*"
          : this.#colNameList.join(", ");

        text = `SELECT ${cols} FROM ${tableName}`;

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
        if (isEmpty(this.#values)) break;

        const returningFields = this.#colNameList.concat(
          this.#colNameList.includes("id") ? [] : ["id"],
        );

        text = `INSERT INTO ${tableName} (${getFields()}) VALUES ${getValues()} RETURNING ${returningFields};`;
        break;
      case SqlOp.delete:
        if (isEmpty(where)) {
          throw new Error("怎么肥事？delete 语句没有 where 条件哦");
        }
        text = `DELETE FROM ${tableName} WHERE ${where};`;
        break;
      case SqlOp.count:
        text = `SELECT count(1)::int AS count FROM ${tableName}`;
        if (!isEmpty(where)) {
          text += ` WHERE ${where}`;
        }
        break;
      case SqlOp.update:
        if (isEmpty(where)) {
          throw new Error("怎么肥事？update 语句没有 where 条件哦");
        }
        const val = this.#colNameList
          .map((k, i) => {
            return sqlFmt("%I = %L", k, this.#values[0][i]);
          })
          .join(",");
        text = `UPDATE ${tableName} SET ${val} WHERE ${where};`;
        break;
      default:
        text = `SELECT 0;`;
        break;
    }
    console.log(text);
    return text;
  }
}
