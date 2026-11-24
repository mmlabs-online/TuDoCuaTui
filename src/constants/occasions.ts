/** Fixed occasion list for the outfit stylist (OQ-7). No free text. */
export const OCCASION_IDS = ["di_lam", "di_choi", "hen_ho", "du_tiec", "du_lich"] as const;

export type OccasionId = (typeof OCCASION_IDS)[number];

export const OCCASION_LABELS: Record<OccasionId, string> = {
  di_lam: "Đi làm",
  di_choi: "Đi chơi",
  hen_ho: "Hẹn hò",
  du_tiec: "Dự tiệc",
  du_lich: "Du lịch",
};

export function isOccasionId(v: unknown): v is OccasionId {
  return typeof v === "string" && (OCCASION_IDS as readonly string[]).includes(v);
}
