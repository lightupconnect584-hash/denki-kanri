// 経費から「ゆきや給料」を削除（本人の給料は経費ではなく利益の中から取る方針に変更）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const item = await prisma.expenseItem.findFirst({ where: { label: { contains: "ゆきや" } } });
  if (!item) { console.log("not found"); process.exit(0); }
  await prisma.expenseItem.delete({ where: { id: item.id } });
  console.log(`deleted: ${item.label} ¥${item.amount.toLocaleString()}`);
  const rest = await prisma.expenseItem.findMany({ orderBy: { order: "asc" } });
  console.log("残りの経費: " + rest.map((e) => `${e.label}¥${e.amount.toLocaleString()}`).join(" / "));
  console.log(`合計: ¥${rest.reduce((s, e) => s + e.amount, 0).toLocaleString()}`);
  await prisma.$disconnect();
})();
