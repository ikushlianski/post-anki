export interface SubjectSeedNode {
  name: string;
  children?: SubjectSeedNode[];
}

export const BUSINESS_SUBJECT_NAME = "Business";

export const BUSINESS_SUB_SUBJECTS: SubjectSeedNode[] = [
  { name: "Marketing" },
  {
    name: "Sales",
    children: [{ name: "Cold sales" }, { name: "Sales process" }, { name: "Objection handling" }],
  },
  { name: "SMM" },
  { name: "Hiring" },
  { name: "Director" },
  { name: "Communication" },
  {
    name: "Management",
    children: [{ name: "Delegation" }, { name: "People management" }],
  },
];

export interface SubjectSeedStore {
  findRootByName(name: string): Promise<string | null>;
  findChildByName(parentId: string, name: string): Promise<string | null>;
  createChild(parentId: string, name: string): Promise<string>;
}

export interface SubjectSeedResult {
  created: string[];
  skipped: string[];
}

async function seedChildren(
  store: SubjectSeedStore,
  parentId: string,
  path: string,
  nodes: SubjectSeedNode[],
  result: SubjectSeedResult,
): Promise<void> {
  for (const node of nodes) {
    const label = `${path} / ${node.name}`;
    const existingId = await store.findChildByName(parentId, node.name);

    if (existingId) {
      result.skipped.push(label);
    } else {
      result.created.push(label);
    }

    const id = existingId ?? (await store.createChild(parentId, node.name));

    if (node.children) {
      await seedChildren(store, id, label, node.children, result);
    }
  }
}

export async function seedBusinessSubSubjects(
  store: SubjectSeedStore,
  nodes: SubjectSeedNode[] = BUSINESS_SUB_SUBJECTS,
): Promise<SubjectSeedResult> {
  const rootId = await store.findRootByName(BUSINESS_SUBJECT_NAME);

  if (!rootId) {
    throw new Error(`Subject "${BUSINESS_SUBJECT_NAME}" not found; run db:seed:subjects first`);
  }

  const result: SubjectSeedResult = { created: [], skipped: [] };

  await seedChildren(store, rootId, BUSINESS_SUBJECT_NAME, nodes, result);

  return result;
}
