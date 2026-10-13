// 時間単価の簡易試算（読み取りのみ）: 月次利益と自社現場日数から算出
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const months = ["2026-07", "2026-08", "2026-09"];
  const [expenses, clients, admins] = await Promise.all([
    prisma.expenseItem.findMany(),
    prisma.client.findMany(),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
  ]);
  const adminIds = new Set(admins.map((a) => a.id));
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const feePct = new Map(clients.map((c) => [c.id, c.feePercent || 0]));

  for (const m of months) {
    const entries = await prisma.salesEntry.findMany({ where: { yearMonth: m } });
    const sales = entries.reduce((s, e) => s + e.sales, 0);
    const material = entries.reduce((s, e) => s + e.material, 0);
    const outsource = entries.reduce((s, e) => s + e.outsource, 0);
    const fee = entries.reduce((s, e) => s + (feePct.get(e.clientId) ? Math.round((e.sales * feePct.get(e.clientId)) / 100) : 0), 0);
    const profit = sales - material - outsource - fee - expenseTotal;

    // 自社現場日数: 管理者が報告者のinspectionの作業日（当月・ユニーク日付）
    const inspections = await prisma.inspection.findMany({
      where: { inspectorId: { in: Array.from(adminIds) } },
      select: { workDate: true, workDates: true },
    });
    const days = new Set();
    for (const i of inspections) {
      const ds = i.workDates.length > 0 ? i.workDates.map((d) => d.slice(0, 10)) : [i.workDate.toISOString().slice(0, 10)];
      for (const d of ds) if (d.startsWith(m)) days.add(d);
    }
    console.log(JSON.stringify({ month: m, sales, material, outsource, fee, expenses: expenseTotal, profit, selfSiteDays: days.size }));
  }
  await prisma.$disconnect();
})();
