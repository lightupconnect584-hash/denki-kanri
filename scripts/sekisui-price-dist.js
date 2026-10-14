// 積水向け請求単価の分布（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const cs = await prisma.client.findMany({ where: { name: { contains: "積水" } }, select: { id: true } });
  const es = await prisma.salesEntry.findMany({
    where: { clientId: { in: cs.map((c) => c.id) }, sales: { gt: 0 } },
    select: { sales: true },
  });
  const v = es.map((e) => e.sales).sort((a, b) => a - b);
  const pct = (p) => v[Math.floor(v.length * p)];
  const avg = Math.round(v.reduce((s, x) => s + x, 0) / v.length);
  console.log(`件数=${v.length} 平均=${avg} 中央値=${pct(0.5)} 25%=${pct(0.25)} 75%=${pct(0.75)} 90%=${pct(0.9)} 最小=${v[0]} 最大=${v[v.length-1]}`);
  // 金額帯別
  const bands = [[0,10000],[10000,20000],[20000,30000],[30000,50000],[50000,100000],[100000,99999999]];
  for (const [lo,hi] of bands) {
    const n = v.filter((x) => x >= lo && x < hi).length;
    console.log(`¥${lo.toLocaleString()}〜: ${n}件`);
  }
  await prisma.$disconnect();
})();
