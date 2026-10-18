// 既存の要アポ案件にcontactTag=SCHEDULEを設定（安全側: 既存は全て日程調整扱い）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const r = await prisma.project.updateMany({
    where: { contactRequired: true, contactTag: null },
    data: { contactTag: "SCHEDULE" },
  });
  console.log(`migrated: ${r.count}件 -> SCHEDULE`);
  await prisma.$disconnect();
})();
