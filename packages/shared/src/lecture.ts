import { z } from "zod";

export const lectureStatusSchema = z.enum(["generating", "ready", "failed"]);

export type LectureStatus = z.infer<typeof lectureStatusSchema>;

export const lectureSourceCandidateReviewStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export type LectureSourceCandidateReviewStatus = z.infer<
  typeof lectureSourceCandidateReviewStatusSchema
>;

export const lectureSectionSchema = z.object({
  id: z.string(),
  lectureId: z.string(),
  order: z.number(),
  heading: z.string(),
  body: z.string(),
});

export type LectureSection = z.infer<typeof lectureSectionSchema>;

export const lectureCitationSchema = z.object({
  id: z.string(),
  lectureId: z.string(),
  title: z.string(),
  url: z.string(),
});

export type LectureCitation = z.infer<typeof lectureCitationSchema>;

export const lectureSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  title: z.string(),
  status: lectureStatusSchema,
  createdAt: z.string(),
  sections: z.array(lectureSectionSchema),
  citations: z.array(lectureCitationSchema),
});

export type Lecture = z.infer<typeof lectureSchema>;

export const lectureSourceCandidateSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  title: z.string(),
  url: z.string(),
  whySelected: z.string(),
  reviewStatus: lectureSourceCandidateReviewStatusSchema,
  createdAt: z.string(),
});

export type LectureSourceCandidate = z.infer<typeof lectureSourceCandidateSchema>;

export const reviewLectureSourceCandidateInput = z.object({
  reviewStatus: z.enum(["approved", "rejected"]),
});

export type ReviewLectureSourceCandidateInput = z.infer<
  typeof reviewLectureSourceCandidateInput
>;
