// 積水請求の不一致リスク監査（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const sekisui = await prisma.client.findMany({ where: { name: { contains: "積水" } }, select: { id: true } });
  const ids = sekisui.map((c) => c.id);
  const done = ["CONFIRMED", "COMPLETED"];

  // ① 完了済みなのに受付番号なし（積水側が照合できない）
  const noNumber = await prisma.project.count({
    where: { clientId: { in: ids }, status: { in: done }, OR: [{ sekisuiNumber: null }, { sekisuiNumber: "" }] },
  });
  // ② 完了済みなのに売上未入力（請求漏れ候補）
  const noSales = await prisma.project.findMany({
    where: { clientId: { in: ids }, status: { in: done }, salesAmount: null },
    select: { title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  // ③ 売上明細と案件のsalesAmountの不一致（編集のズレ）
  const entries = await prisma.salesEntry.findMany({
    where: { clientId: { in: ids }, projectId: { not: null } },
    select: { label: true, sales: true, yearMonth: true, projectId: true },
  });
  const projs = await prisma.project.findMany({
    where: { id: { in: entries.map((e) => e.projectId) } },
    select: { id: true, salesAmount: true },
  });
  const pMap = new Map(projs.map((p) => [p.id, p.salesAmount]));
  const mismatch = entries
    .map((e) => ({ ...e, pAmount: pMap.get(e.projectId) }))
    .filter((e) => e.pAmount != null && e.pAmount !== e.sales);

  console.log(`① 完了済みで受付番号なし: ${noNumber}件`);
  console.log(`② 完了済みで売上未入力: ${noSales.length}件`);
  for (const p of noSales.slice(0, 10)) console.log(`   - ${p.title} (${p.updatedAt.toISOString().slice(0,10)})`);
  console.log(`③ 売上明細と案件の金額不一致: ${mismatch.length}件`);
  for (const m of mismatch.slice(0, 10)) console.log(`   - ${m.yearMonth} ${m.label}: 明細¥${m.sales} / 案件¥${m.pAmount}`);
  await prisma.$disconnect();
})();
