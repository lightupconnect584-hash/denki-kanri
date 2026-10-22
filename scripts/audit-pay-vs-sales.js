// 単価表の総点検: 作業名ごとに 支払(amount) と 請求(salesAmount) を並べて、マージンゼロ等の怪しい行を洗い出す
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const cs = await prisma.client.findMany({ where: { name: { contains: "積水" } }, select: { id: true } });
  const projects = await prisma.project.findMany({
    where: {
      clientId: { in: cs.map((c) => c.id) },
      amount: { gt: 0 },
      assignedToId: { notIn: admins.map((a) => a.id) },
      workType: { not: null },
    },
    select: { workType: true, amount: true, salesAmount: true, materialSupplied: true },
  });
  const map = new Map();
  for (const p of projects) {
    const key = (p.workType || "").trim().replace(/[\s\u3000]+/g, "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const rows = [];
  for (const [name, arr] of map) {
    if (arr.length < 2) continue;
    const pays = arr.map((p) => p.amount);
    const sales = arr.filter((p) => p.salesAmount > 0).map((p) => p.salesAmount);
    const zeroMargin = arr.filter((p) => p.salesAmount > 0 && p.amount >= p.salesAmount).length;
    rows.push({
      name, n: arr.length,
      payMed: med(pays),
      salesMed: sales.length ? med(sales) : null,
      marginMed: sales.length ? med(sales) - med(pays) : null,
      zeroMargin,
      supplied: Math.round((arr.filter((p) => p.materialSupplied).length / arr.length) * 100),
    });
  }
  rows.sort((a, b) => b.n - a.n);
  for (const r of rows) {
    const flag = (r.marginMed !== null && r.marginMed <= 0) || r.zeroMargin > r.n / 2 ? " ⚠⚠" : (r.zeroMargin > 0 ? " ⚠" : "");
    console.log(`${r.name} | ${r.n}件 | 支払中央${r.payMed} | 請求中央${r.salesMed} | マージン${r.marginMed} | 支払≧請求が${r.zeroMargin}件 | 材料支給${r.supplied}%${flag}`);
  }
  await prisma.$disconnect();
})();
