// クレール シャーメゾン プレミア の報告・写真状態を確認（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const projects = await prisma.project.findMany({
    where: { title: { contains: "クレール" } },
    select: {
      id: true, title: true, status: true,
      inspections: { select: { id: true, createdAt: true, _count: { select: { photos: true } } } },
    },
  });
  for (const p of projects) {
    console.log(`${p.title} [${p.status}] id=${p.id}`);
    for (const i of p.inspections) {
      console.log(`  inspection ${i.id} photos=${i._count.photos} at=${i.createdAt.toISOString().slice(0, 10)}`);
    }
    if (p.inspections.length === 0) console.log("  (報告なし)");
  }
  await prisma.$disconnect();
})();
