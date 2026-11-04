export {
  findCurriculumMappedToNode,
  getPrimaryConfirmedDomainNodeId,
  getPrimaryConfirmedDomainNodeIdsByCurriculumIds,
  listMappingsForCurriculum,
} from "./curriculum-domain-mapping-read.repo.js";
export {
  deleteMappingsForCurriculum,
  insertConfirmedMapping,
  insertConfirmedMappingIdempotent,
  insertSuggestedMappings,
  rejectAllConfirmedForCurriculum,
  resolveMapping,
  type InsertConfirmedMappingParams,
  type ResolveCurriculumDomainMappingError,
  type ResolveMappingParams,
  type SuggestedMappingInput,
} from "./curriculum-domain-mapping-write.repo.js";
