import { prisma } from "./prisma";

// 埼玉県の主な市町村（場所から積水 埼玉/北関東を推定するための簡易判定）
export const SAITAMA_HINTS = [
  "埼玉", "さいたま", "川口", "上尾", "深谷", "新座", "入間", "和光", "川越",
  "熊谷", "蓮田", "蕨", "日高", "所沢", "越谷", "草加", "春日部", "狭山",
  "久喜", "桶川", "北本", "鴻巣", "行田", "加須", "羽生", "本庄", "東松山",
  "朝霞", "志木", "富士見", "ふじみ野", "三郷", "八潮", "吉川", "戸田", "鶴ヶ島", "坂戸", "飯能",
];

// エリア（明示指定）を優先し、なければ住所から推定
export function guessCategory(location: string, region?: string | null): string {
  if (region === "埼玉") return "SEKISUI_SAITAMA";
  if (region === "北関東") return "SEKISUI_KITA";
  return SAITAMA_HINTS.some((h) => location.includes(h)) ? "SEKISUI_SAITAMA" : "SEKISUI_KITA";
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// 案件の売上明細行を作成/調整する
// - 行がなければ month に新規作成
//   協力会社担当: 外注費=案件金額 / 自分施工（担当が管理者）: 売上=案件金額・外注費0
// - 行があって月が違えば month に移動（入力済みの売上・材料費は保持）
export async function syncSalesEntryForProject(
  project: {
    id: string; title: string; location: string; amount: number | null;
    assignedToId?: string | null; salesAmount?: number | null; materialCost?: number | null;
    region?: string | null;
  },
  month: string
): Promise<void> {
  try {
    // 担当が管理者＝自社施工
    let selfAssigned = false;
    if (project.assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: project.assignedToId },
        select: { role: true },
      });
      selfAssigned = assignee?.role === "ADMIN";
    }
    const existing = await prisma.salesEntry.findUnique({ where: { projectId: project.id } });
    if (existing) {
      if (existing.yearMonth !== month) {
        const max = await prisma.salesEntry.aggregate({
          where: { yearMonth: month },
          _max: { order: true },
        });
        await prisma.salesEntry.update({
          where: { id: existing.id },
          data: { yearMonth: month, order: (max._max.order ?? -1) + 1 },
        });
      }
      return;
    }
    const max = await prisma.salesEntry.aggregate({
      where: { yearMonth: month },
      _max: { order: true },
    });
    await prisma.salesEntry.create({
      data: {
        yearMonth: month,
        category: guessCategory(project.location, project.region),
        label: project.title,
        // 売上: 案件の売上（積水請求額）。自社施工で未入力なら金額を売上とみなす
        sales: project.salesAmount ?? (selfAssigned ? (project.amount ?? 0) : 0),
        material: project.materialCost ?? 0,
        outsource: selfAssigned ? 0 : (project.amount ?? 0),
        projectId: project.id,
        order: (max._max.order ?? -1) + 1,
      },
    });
  } catch {
    // 売上集計の同期失敗で本処理を止めない
  }
}
