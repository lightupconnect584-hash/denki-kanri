// 検証用テスト協力会社アカウントを作成し、適当な完了済み積水案件を1件割り当てる
require("dotenv").config({ path: ".env" });
const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const token = randomUUID();
  const user = await prisma.user.create({
    data: {
      name: "テスト確認用",
      email: `invite_${token}`,
      password: null,
      role: "PARTNER",
      companyName: "【テスト】権限確認用",
      inviteToken: token,
    },
  });
  // 機密が全部入っている積水の完了済み案件を1件選んで割り当て（元の担当は後で戻す）
  const proj = await prisma.project.findFirst({
    where: {
      status: "CONFIRMED",
      salesAmount: { not: null },
      sekisuiNumber: { not: null },
      client: { name: { contains: "積水" } },
      inspections: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, assignedToId: true, salesAmount: true },
  });
  if (!proj) { console.log("対象案件なし"); process.exit(1); }
  await prisma.project.update({ where: { id: proj.id }, data: { assignedToId: user.id } });
  console.log(JSON.stringify({ inviteToken: token, userId: user.id, projectId: proj.id, projectTitle: proj.title, originalAssignee: proj.assignedToId, salesAmount: proj.salesAmount }));
  await prisma.$disconnect();
})();
