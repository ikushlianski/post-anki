import { describe, expect, it } from "vitest";
import {
  defaultConnectorsFile,
  loadConnectorConfig,
  loadKnowledgeSourceConnectors,
  parseConnectorConfig,
} from "./connector-config.js";

const validConnector = {
  name: "inbox-crm",
  source: { kind: "database", id: "3cddec4dfc6e80b38224c4ac74164eef" },
  tag: "CRM",
  destination: {
    kind: "project-todo",
    file: "/tmp/todo.md",
    direction: "reading-notes",
  },
};

describe("parseConnectorConfig", () => {
  it("accepts a real connector and defaults removeAfterImport to keep", () => {
    const config = parseConnectorConfig(JSON.stringify({ connectors: [validConnector] }));

    expect(config.connectors[0]?.removeAfterImport).toBe(false);
    expect(config.connectors[0]?.destination.kind).toBe("project-todo");
  });

  it("refuses a connector whose source id was never filled in, naming it", () => {
    const raw = JSON.stringify({
      connectors: [{ ...validConnector, source: { kind: "page", id: "REPLACE_WITH_PAGE_ID" } }],
    });

    expect(() => parseConnectorConfig(raw)).toThrow(/inbox-crm.*placeholder/);
  });

  it("refuses a destination that names no file", () => {
    const raw = JSON.stringify({
      connectors: [{ ...validConnector, destination: { kind: "project-todo", direction: "x" } }],
    });

    expect(() => parseConnectorConfig(raw)).toThrow();
  });
});

describe("loadConnectorConfig", () => {
  it("reads the repo's own sample file, which still holds placeholders", () => {
    expect(defaultConnectorsFile()).toMatch(/notion-connectors\.json$/);
    expect(() => loadConnectorConfig()).toThrow(/biz-education-spa.*placeholder/);
  });
});

describe("knowledge-source connectors", () => {
  const phrases = {
    name: "english-phrases-3",
    source: { kind: "page", id: "2dfdec4d-fc6e-80bc-9803-c86fb9e994eb" },
    destination: { kind: "knowledge-source", subjectPath: "English" },
  };

  it("should need no tag and default to 10 per run with deletion on", () => {
    const [connector] = parseConnectorConfig(JSON.stringify({ connectors: [phrases] })).connectors;

    expect(connector?.tag).toBeUndefined();
    expect(connector?.destination).toMatchObject({ maxPerRun: 10, deleteAfterImport: true });
  });

  it("should still require a tag for other destinations", () => {
    const raw = JSON.stringify({ connectors: [{ ...validConnector, tag: undefined }] });

    expect(() => parseConnectorConfig(raw)).toThrow(/tag/);
  });

  it("should load the repo's phrases connector even while other entries hold placeholders", () => {
    const connectors = loadKnowledgeSourceConnectors();

    expect(connectors.map((connector) => connector.name)).toEqual(["english-phrases-3"]);
    expect(connectors[0]?.destination.subjectPath).toBe("English");
  });
});
