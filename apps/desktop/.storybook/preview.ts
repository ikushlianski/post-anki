import { createElement, useEffect, type ReactNode } from "react";
import type { Preview } from "@storybook/react-vite";

import "../src/tailwind.css";
import "../src/theme.css";
import "../src/styles.css";
import "../src/shell.css";
import { clearTauriMocks, setTauriMocks, type TauriMocks } from "./stubs/tauri-core";

function TauriMockScope({ token, children }: { token: symbol; children?: ReactNode }) {
  useEffect(() => () => clearTauriMocks(token), [token]);

  return children;
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Color theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const token = setTauriMocks((context.parameters.tauriMocks ?? {}) as TauriMocks);

      window.localStorage.clear();

      return createElement(TauriMockScope, { token }, createElement(Story));
    },
    (Story, context) => {
      document.documentElement.dataset.theme = String(context.globals.theme);

      return createElement(
        "div",
        { style: { minHeight: "100vh", padding: 24, background: "var(--bg)", color: "var(--text)" } },
        createElement(Story),
      );
    },
  ],
  parameters: {
    layout: "fullscreen",
  },
};

export default preview;
