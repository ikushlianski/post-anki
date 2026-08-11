import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { resolveNodePathByName, type NamedNode } from "../domain-map/domain-node-name-resolver.js";

export const WEB_DEVELOPMENT_SUBJECT_NAME = "Programming / Web Development";

export interface RoleTemplateDefinition {
  id: string;
  name: string;
  targetRoleLabel: string;
  targets: string[][];
}

interface RawRolePathsFile {
  roleTemplates: RoleTemplateDefinition[];
}

const ROLE_PATHS_YAML_URL = new URL("../../scripts/seed-data/role-paths.yaml", import.meta.url);

let cachedDefinitions: RoleTemplateDefinition[] | undefined;

export function listRoleTemplateDefinitions(): RoleTemplateDefinition[] {
  if (!cachedDefinitions) {
    const raw = parse(readFileSync(ROLE_PATHS_YAML_URL, "utf8")) as RawRolePathsFile;
    cachedDefinitions = raw.roleTemplates;
  }

  return cachedDefinitions;
}

export function getRoleTemplateDefinition(id: string): RoleTemplateDefinition | undefined {
  return listRoleTemplateDefinitions().find((definition) => definition.id === id);
}

export interface ResolvedRoleTemplateTarget {
  domainNodeId: string;
  name: string;
}

export function resolveRoleTemplateTargets(
  definition: RoleTemplateDefinition,
  nodes: NamedNode[],
): ResolvedRoleTemplateTarget[] {
  return definition.targets.map((targetPath) => {
    const resolved = resolveNodePathByName(nodes, targetPath);

    if (!resolved.fullyResolved || !resolved.nodeId) {
      throw new Error(
        `learning-path role template "${definition.id}": could not resolve target "${targetPath.join(" > ")}" against the taxonomy`,
      );
    }

    const node = nodes.find((candidate) => candidate.id === resolved.nodeId)!;

    return { domainNodeId: node.id, name: node.name };
  });
}
