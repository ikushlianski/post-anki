import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig, type Plugin } from "vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  async viteFinal(viteConfig) {
    const { default: appConfig } = await import("../vite.config.ts");

    const appPlugins = (appConfig.plugins ?? [])
      .flat()
      .filter((plugin): plugin is Plugin => typeof plugin === "object" && plugin !== null && "name" in plugin)
      .filter((plugin) => !plugin.name.startsWith("vite:react"));

    const withAppConfig = mergeConfig(viteConfig, {
      plugins: appPlugins,
      resolve: appConfig.resolve ?? {},
    });

    return mergeConfig(withAppConfig, {
      resolve: {
        alias: {
          "@tauri-apps/api/core": fileURLToPath(new URL("./stubs/tauri-core.ts", import.meta.url)),
        },
      },
    });
  },
};

export default config;
