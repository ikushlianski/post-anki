export interface ModuleQuizSlot {
  topicId: string;
  count: number;
}

export interface ModuleQuizPlan {
  perTopic: ModuleQuizSlot[];
  integrative: number;
  total: number;
}

export function planModuleQuizDistribution(
  topicIds: string[],
  target: number,
): ModuleQuizPlan {
  const n = topicIds.length;

  if (n === 0 || target <= 0) {
    return { perTopic: [], integrative: 0, total: 0 };
  }

  if (n === 1) {
    return {
      perTopic: [{ topicId: topicIds[0]!, count: target }],
      integrative: 0,
      total: target,
    };
  }

  const integrative = Math.max(1, Math.round(target * 0.2));
  const perTopicBudget = Math.max(n, target - integrative);
  const extras = Math.max(0, Math.min(n, perTopicBudget - n));

  const perTopic = topicIds.map((topicId, index) => ({
    topicId,
    count: index < extras ? 2 : 1,
  }));

  const total = perTopic.reduce((sum, slot) => sum + slot.count, 0) + integrative;

  return { perTopic, integrative, total };
}
