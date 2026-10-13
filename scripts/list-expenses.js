require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const ex = await prisma.expenseItem.findMany({ orderBy: { order: "asc" } });
  for (const e of ex) console.log(`${e.label}: ¥${e.amount.toLocaleString()}`);
  console.log(`合計: ¥${ex.reduce((s, e) => s + e.amount, 0).toLocaleString()}`);
  await prisma.$disconnect();
})();
