import Database from "@tauri-apps/plugin-sql";
import { isBoolean } from "es-toolkit";
import { Kysely } from "kysely";
import { TauriSqliteDialect } from "kysely-dialect-tauri";
import { SerializePlugin } from "kysely-plugin-serialize";
import type { DatabaseSchema } from "@/types/database";
import { getSaveDatabasePath } from "@/utils/path";

let db: Kysely<DatabaseSchema> | null = null;

export const getDatabase = async () => {
  if (db) return db;

  const path = await getSaveDatabasePath();

  db = new Kysely<DatabaseSchema>({
    dialect: new TauriSqliteDialect({
      database: (prefix) => Database.load(prefix + path),
    }),
    plugins: [
      new SerializePlugin({
        deserializer: (value) => value,
        serializer: (value) => {
          if (isBoolean(value)) {
            return Number(value);
          }

          return value;
        },
      }),
    ],
  });

  await db.schema
    .createTable("history")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("type", "text")
    .addColumn("group", "text")
    .addColumn("value", "text")
    .addColumn("search", "text")
    .addColumn("count", "integer")
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("favorite", "integer", (col) => col.defaultTo(0))
    .addColumn("createTime", "text")
    .addColumn("note", "text")
    .addColumn("subtype", "text")
    .execute();

  // 创建索引以提高查询性能
  try {
    await db.schema
      .createIndex("idx_history_createTime")
      .ifNotExists()
      .on("history")
      .column("createTime")
      .execute();

    await db.schema
      .createIndex("idx_history_group")
      .ifNotExists()
      .on("history")
      .column("group")
      .execute();

    await db.schema
      .createIndex("idx_history_favorite")
      .ifNotExists()
      .on("history")
      .column("favorite")
      .execute();

    await db.schema
      .createIndex("idx_history_type")
      .ifNotExists()
      .on("history")
      .column("type")
      .execute();
  } catch (_error) {}

  return db;
};

/**
 * 优化数据库性能
 */
export const optimizeDatabase = async () => {
  const db = await getDatabase();

  try {
    // VACUUM 命令会重建数据库文件，回收未使用的空间
    await db.executeQuery({
      parameters: [],
      query: { parameters: [], sql: "VACUUM" },
      queryId: "vacuum",
      sql: "VACUUM",
    } as any);

    // ANALYZE 命令会更新查询优化器的统计信息
    await db.executeQuery({
      parameters: [],
      query: { parameters: [], sql: "ANALYZE" },
      queryId: "analyze",
      sql: "ANALYZE",
    } as any);
  } catch (_error) {}
};

export const destroyDatabase = async () => {
  const db = await getDatabase();

  return db.destroy();
};
