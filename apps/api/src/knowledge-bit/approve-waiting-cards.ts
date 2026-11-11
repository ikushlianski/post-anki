export interface WaitingCard {
  id: string;
  subjectId: string | null;
  subjectName: string | null;
  activeVariantIds: string[];
  isPhrase: boolean;
}

export interface ApproveWaitingCardsClient {
  listWaiting: () => Promise<WaitingCard[]>;
  approve: (cards: WaitingCard[]) => Promise<number>;
  countApprovedUnseen: () => Promise<number>;
}

export interface ApproveWaitingCardsReport {
  applied: boolean;
  eligible: number;
  approved: number;
  perSubject: { subject: string; count: number }[];
  skippedNoVariant: number;
  skippedNoSubject: number;
  approvedUnseenTotal: number;
}

export const UNASSIGNED_LABEL = "(no subject)";
export const APPROVE_BATCH = 200;

export function parseApproveWaitingCardsArgs(argv: readonly string[]) {
  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    includeUnassigned: argv.includes("--include-unassigned"),
  };
}

export async function runApproveWaitingCards(
  client: ApproveWaitingCardsClient,
  options: { apply: boolean; includeUnassigned: boolean },
): Promise<ApproveWaitingCardsReport> {
  const waiting = await client.listWaiting();
  const withVariant = waiting.filter((card) => card.activeVariantIds.length > 0);
  const skippedNoVariant = waiting.length - withVariant.length;
  const skippedNoSubject = options.includeUnassigned ? 0 : withVariant.filter((card) => !card.subjectId).length;
  const eligible = options.includeUnassigned ? withVariant : withVariant.filter((card) => card.subjectId);
  const counts = new Map<string, number>();

  for (const card of eligible) {
    const name = card.subjectId ? (card.subjectName ?? card.subjectId) : UNASSIGNED_LABEL;

    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  let approved = 0;

  if (options.apply) {
    for (let i = 0; i < eligible.length; i += APPROVE_BATCH) {
      approved += await client.approve(eligible.slice(i, i + APPROVE_BATCH));
    }
  }

  return {
    applied: options.apply,
    eligible: eligible.length,
    approved,
    perSubject: [...counts].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count),
    skippedNoVariant,
    skippedNoSubject,
    approvedUnseenTotal: await client.countApprovedUnseen(),
  };
}
