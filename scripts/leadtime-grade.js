// 受付→完了報告のリードタイム（協力会社別・要アポ案件除外・読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 90 * 86400000);
  const projects = await prisma.project.findMany({
    where: {
      NOT: { contactRequired: true, contactTag: "SCHEDULE" }, // 日程調整のみ除外
      inspections: { some: {} },
      createdAt: { gte: since },
    },
    select: {
      id: true, createdAt: true,
      assignedTo: { select: { id: true, name: true, companyName: true } },
      inspections: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  const intakes = await prisma.intakeDoc.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const intakeMap = new Map();
  for (const i of intakes) if (!intakeMap.has(i.projectId)) intakeMap.set(i.projectId, i.createdAt);

  const byPartner = new Map();
  for (const p of projects) {
    const start = intakeMap.get(p.id) || p.createdAt;
    const end = p.inspections[0]?.createdAt;
    if (!end) continue;
    const days = (end - start) / 86400000;
    if (days < 0 || days > 120) continue; // 異常値除外
    const key = p.assignedTo ? (p.assignedTo.companyName || p.assignedTo.name) : "未割当";
    if (!byPartner.has(key)) byPartner.set(key, []);
    byPartner.get(key).push(days);
  }
  const rows = Array.from(byPartner.entries()).map(([name, arr]) => {
    arr.sort((a, b) => a - b);
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    const med = arr[Math.floor(arr.length / 2)];
    return { name, n: arr.length, avg: avg.toFixed(1), med: med.toFixed(1) };
  }).sort((a, b) => b.n - a.n);
  const grade = (m) => (m <= 2 ? "S" : m <= 4 ? "A" : m <= 7 ? "B" : "C");
  for (const r of rows) console.log(`${r.name}: ${r.n}件 中央値${r.med}日 平均${r.avg}日 → ${r.n >= 5 ? grade(Number(r.med)) : "判定保留(件数不足)"}`);
  await prisma.$disconnect();
})();
