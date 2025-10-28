import {
  isRegistered,
  register,
  type ShortcutHandler,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { useAsyncEffect, useUnmount } from "ahooks";
import { castArray } from "es-toolkit/compat";
import { useState } from "react";

export const useRegister = (
  handler: ShortcutHandler,
  deps: Array<string | string[] | undefined>,
) => {
  const [oldShortcuts, setOldShortcuts] = useState(deps[0]);

  useAsyncEffect(async () => {
    const [shortcuts] = deps;

    // 先注销旧的快捷键
    for await (const shortcut of castArray(oldShortcuts)) {
      if (!shortcut) continue;

      try {
        const registered = await isRegistered(shortcut);

        if (registered) {
          await unregister(shortcut);
        }
      } catch (_err) {
        // 忽略注销错误
      }
    }

    if (!shortcuts) return;

    // 注册新的快捷键，如果已注册则先注销
    try {
      for await (const shortcut of castArray(shortcuts)) {
        if (!shortcut) continue;

        const registered = await isRegistered(shortcut);

        if (registered) {
          await unregister(shortcut);
        }
      }

      await register(shortcuts, (event) => {
        if (event.state === "Released") return;

        handler(event);
      });

      setOldShortcuts(shortcuts);
    } catch (_err) {
      // 忽略注册错误（可能是快捷键冲突）
    }
  }, deps);

  useUnmount(() => {
    const [shortcuts] = deps;

    if (!shortcuts) return;

    try {
      unregister(shortcuts);
    } catch (_err) {
      // 忽略注销错误
    }
  });
};
