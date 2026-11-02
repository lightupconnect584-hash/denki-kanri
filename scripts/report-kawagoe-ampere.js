// 川越アンペア変更工事: 管理者の代理完了報告（結果OK・作業完了・作業日10/29）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  const projectId = "cmu96prnt0003jd1od9z0hj2r";
  const insp = await prisma.inspection.create({
    data: {
      projectId,
      inspectorId: admin.id,
      result: "OK",
      workDate: new Date("2026-10-29T00:00:00.000Z"),
      workDates: ["2026-10-29"],
      notes: "【実施内容】\n作業完了",
    },
  });
  const p = await prisma.project.update({
    where: { id: projectId },
    data: { status: "INSPECTED", notifyAdminAt: null },
    select: { title: true, status: true },
  });
  console.log(`${p.title} -> ${p.status} (報告ID: ${insp.id})`);
  await prisma.$disconnect();
})();
