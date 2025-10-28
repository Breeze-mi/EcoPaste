import { useMount } from "ahooks";
import { cloneDeep } from "es-toolkit";
import { isEmpty, remove } from "es-toolkit/compat";
import { nanoid } from "nanoid";
import {
  type ClipboardChangeOptions,
  onClipboardChange,
  startListening,
} from "tauri-plugin-clipboard-x-api";
import { fullName } from "tauri-plugin-fs-pro-api";
import {
  insertHistory,
  selectHistory,
  updateHistory,
} from "@/database/history";
import type { State } from "@/pages/Main";
import { getClipboardTextSubtype } from "@/plugins/clipboard";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";
import { formatDate } from "@/utils/dayjs";

export const useClipboard = (
  state: State,
  options?: ClipboardChangeOptions,
) => {
  useMount(async () => {
    try {
      await startListening();
    } catch (_error) {
      return;
    }

    onClipboardChange(async (result) => {
      try {
        const { files, image, html, rtf, text } = result;

        // 性能优化：早期返回，避免不必要的 Object.values() 和 every() 调用
        if (
          isEmpty(files) &&
          isEmpty(image) &&
          isEmpty(html) &&
          isEmpty(rtf) &&
          isEmpty(text)
        ) {
          return;
        }

        const { copyPlain } = clipboardStore.content;

        const data = {
          createTime: formatDate(),
          favorite: false,
          group: "text",
          id: nanoid(),
          search: text?.value,
        } as DatabaseSchemaHistory;

        if (files) {
          Object.assign(data, files, {
            group: "files",
            search: files.value.join(" "),
          });
        } else if (html && !copyPlain) {
          Object.assign(data, html);
        } else if (rtf && !copyPlain) {
          Object.assign(data, rtf);
        } else if (text) {
          const subtype = await getClipboardTextSubtype(text.value);

          Object.assign(data, text, {
            subtype,
          });
        } else if (image) {
          Object.assign(data, image, {
            group: "image",
          });
        }

        const sqlData = cloneDeep(data);

        const { type, value, group, createTime } = data;

        if (type === "image") {
          sqlData.value = await fullName(value);
        }

        if (type === "files") {
          sqlData.value = JSON.stringify(value);
        }

        const { autoDeduplicate, autoSort } = clipboardStore.content;
        const visible = state.group === "all" || state.group === group;

        // 性能优化：只有在需要去重或排序时才查询数据库
        // 如果两个都关闭，直接添加新记录，跳过数据库查询
        if (!autoDeduplicate && !autoSort) {
          if (visible) {
            state.list.unshift(data);
          }
          return insertHistory(sqlData);
        }

        // 查询数据库中是否存在相同内容
        const [matched] = await selectHistory((qb) => {
          const { type, value } = sqlData;
          return qb.where("type", "=", type).where("value", "=", value);
        });

        // 理解1：自动去重控制是否允许数据库中存在重复记录
        if (matched) {
          // 找到重复记录

          if (!autoDeduplicate) {
            // 关闭去重：允许数据库中存在重复，添加新记录
            if (visible) {
              state.list.unshift(data);
            }
            return insertHistory(sqlData);
          }

          // 开启去重：不允许数据库中存在重复
          if (autoSort) {
            // 开启排序：更新时间并移到顶部
            const { id } = matched;

            if (visible) {
              remove(state.list, { id });
              state.list.unshift({ ...data, id });
            }

            return updateHistory(id, { createTime });
          }

          // 开启去重但关闭排序：不做任何操作（保持原位置）
          return;
        }

        // 没有找到重复内容，添加新记录
        if (visible) {
          state.list.unshift(data);
        }

        insertHistory(sqlData);
      } catch (_error) {}
    }, options);
  });
};
