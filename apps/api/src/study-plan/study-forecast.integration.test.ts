import { Readable } from "node:stream";
import type http from "node:http";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../db/client.js";
import { createStudyPlanTestDb } from "./study-plan-test-db.js";

const db = await createStudyPlanTestDb("study_forecast");

const { getStudyForecast } = await import("./study-forecast.service.js");
const { readSubjectStudyOptions, updateSubjectStudyOptions } = await import(
  "../subject-study-options/subject-study-options.orchestrator.js"
);
const { handleUpdateSubjectStudyOptions } = await import(
  "../subject-study-options/subject-study-options.controller.js"
);

const NOW = new Date("2090-03-10T12:00:00.000Z");
const DAY_MS = 86_400_000;

afterAll(() => db.dispose(closeDb));
beforeEach(() => db.reset());

async function patch(subjectId: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { headers: {} }) as unknown as http.IncomingMessage;
  const out = { status: 0, body: "" };
  const res = {
    writeHead: (code: number) => {
      out.status = code;
    },
    end: (payload?: string) => {
      out.body = payload ?? "";
    },
  } as unknown as http.ServerResponse;

  await handleUpdateSubjectStudyOptions(req, res, subjectId);

  return { status: out.status, body: out.body ? JSON.parse(out.body) : null };
}

describe("study intent storage (real Postgres)", () => {
  it("migration: should add three empty subject fields and leave existing subjects unchanged", async () => {
    const subject = await db.seedSubject();
    const { rows } = await db.client.query(
      `SELECT study_intent, exam_date, exam_planned_at, new_cards_per_day FROM subjects WHERE id = $1`,
      [subject],
    );

    expect(rows[0]).toEqual({ study_intent: null, exam_date: null, exam_planned_at: null, new_cards_per_day: null });
  });

  it("should save Exam with a date and stamp the planned time", async () => {
    const subject = await db.seedSubject();
    const result = await updateSubjectStudyOptions(subject, { studyIntent: "exam", examDate: "2090-04-01" }, NOW);
    const { rows } = await db.client.query(`SELECT exam_planned_at FROM subjects WHERE id = $1`, [subject]);

    expect(result?.own).toMatchObject({ studyIntent: "exam", examDate: "2090-04-01" });
    expect(result?.intent).toEqual({ studyIntent: "exam", examDate: "2090-04-01", source: subject });
    expect(rows[0].exam_planned_at).not.toBeNull();
  });

  it("should refuse Exam without a date with 400 exam_date_required", async () => {
    const subject = await db.seedSubject();

    expect(await patch(subject, { studyIntent: "exam" })).toEqual({
      status: 400,
      body: { error: "exam_date_required" },
    });
  });

  it("should refuse a past date and a date without the Exam intent", async () => {
    const subject = await db.seedSubject();

    expect((await patch(subject, { studyIntent: "exam", examDate: "2000-01-01" })).body).toEqual({
      error: "exam_date_in_past",
    });
    expect((await patch(subject, { examDate: "2099-01-01" })).body).toEqual({
      error: "exam_date_requires_exam_intent",
    });
  });

  it("should clear date and planned time when switching to Long-term", async () => {
    const subject = await db.seedSubject();
    const future = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10);

    expect((await patch(subject, { studyIntent: "exam", examDate: future })).status).toBe(200);
    expect((await patch(subject, { studyIntent: "long_term" })).status).toBe(200);

    const { rows } = await db.client.query(
      `SELECT study_intent, exam_date, exam_planned_at FROM subjects WHERE id = $1`,
      [subject],
    );

    expect(rows[0]).toEqual({ study_intent: "long_term", exam_date: null, exam_planned_at: null });
  });

  it("should report the parent as the intent source for a child", async () => {
    const parent = await db.seedSubject();
    const child = await db.seedSubject(parent);

    await updateSubjectStudyOptions(parent, { studyIntent: "exam", examDate: "2090-04-01" }, NOW);

    expect((await readSubjectStudyOptions(child))?.intent).toEqual({
      studyIntent: "exam",
      examDate: "2090-04-01",
      source: parent,
    });
  });
});

describe("study forecast (real Postgres)", () => {
  it("should return days left, due today and a finish date for an Exam subject with sub-subjects", async () => {
    const parent = await db.seedSubject();
    const child = await db.seedSubject(parent);

    await updateSubjectStudyOptions(parent, { studyIntent: "exam", examDate: "2090-04-09" }, NOW);
    await db.seedBulk(child, 30, null);
    await db.seedBulk(child, 5, new Date(NOW.getTime() - DAY_MS));
    await db.seedBulk(parent, 3, new Date(NOW.getTime() + 3 * DAY_MS));

    const forecast = await getStudyForecast(parent, "UTC", NOW);

    expect(forecast).toMatchObject({
      intent: "exam",
      examDate: "2090-04-09",
      daysLeft: 30,
      examPassed: false,
      maxIntervalDays: 29,
      hasCards: true,
    });
    expect(forecast?.reviews.dueToday).toBe(5);
    expect(forecast?.newCards.remaining).toBe(30);
    expect(forecast?.newCards.finishOn).not.toBeNull();
    expect(forecast?.newCards.finishesBeforeExam).toBe(true);
    expect(forecast?.days).toHaveLength(30);
  });

  it("should return null for an unknown subject and an empty forecast for a subject without cards", async () => {
    const empty = await db.seedSubject();

    expect(await getStudyForecast("subj_missing", "UTC", NOW)).toBeNull();
    expect(await getStudyForecast(empty, "UTC", NOW)).toMatchObject({
      intent: "long_term",
      hasCards: false,
      recentRetention: null,
      newCards: { remaining: 0, finishOn: null },
      reviews: { dueToday: 0, peakPerDay: 0 },
    });
  });
});
