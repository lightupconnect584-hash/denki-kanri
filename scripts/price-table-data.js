// 単価表の元データ: 積水案件の作業名ごとの売上統計（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const cs = await prisma.client.findMany({ where: { name: { contains: "積水" } }, select: { id: true } });
  const projects = await prisma.project.findMany({
    where: { clientId: { in: cs.map((c) => c.id) }, salesAmount: { gt: 0 }, workType: { not: null } },
    select: { workType: true, salesAmount: true },
  });
  const map = new Map();
  for (const p of projects) {
    const key = (p.workType || "").trim().replace(/[\s\u3000]+/g, "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p.salesAmount);
  }
  const rows = [];
  for (const [name, arr] of map) {
    arr.sort((a, b) => a - b);
    const mode = (() => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return Array.from(m.entries()).sort((x, y) => y[1] - x[1])[0][0]; })();
    rows.push({ name, n: arr.length, med: arr[Math.floor(arr.length / 2)], mode, min: arr[0], max: arr[arr.length - 1] });
  }
  rows.sort((a, b) => b.n - a.n);
  console.log(JSON.stringify(rows));
  await prisma.$disconnect();
})();
