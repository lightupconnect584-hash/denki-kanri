// 協力会社向け単価表の元データ: 協力会社に支払った金額（amount）の作業名別統計
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const adminIds = admins.map((a) => a.id);
  const cs = await prisma.client.findMany({ where: { name: { contains: "積水" } }, select: { id: true } });
  const projects = await prisma.project.findMany({
    where: {
      clientId: { in: cs.map((c) => c.id) },
      amount: { gt: 0 },
      workType: { not: null },
      assignedToId: { notIn: adminIds }, // 協力会社に出した案件のみ
    },
    select: { workType: true, amount: true, materialSupplied: true },
  });
  const map = new Map();
  for (const p of projects) {
    const key = (p.workType || "").trim().replace(/[\s\u3000]+/g, "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, { amounts: [], supplied: 0 });
    map.get(key).amounts.push(p.amount);
    if (p.materialSupplied) map.get(key).supplied++;
  }
  const rows = [];
  for (const [name, d] of map) {
    const arr = d.amounts.sort((a, b) => a - b);
    const mode = (() => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return Array.from(m.entries()).sort((x, y) => y[1] - x[1])[0][0]; })();
    rows.push({ name, n: arr.length, med: arr[Math.floor(arr.length / 2)], mode, min: arr[0], max: arr[arr.length - 1], suppliedRate: Math.round((d.supplied / arr.length) * 100) });
  }
  rows.sort((a, b) => b.n - a.n);
  console.log(JSON.stringify(rows));
  await prisma.$disconnect();
})();
