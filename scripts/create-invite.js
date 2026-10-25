// 協力会社の招待リンクを発行（相手がリンクからID・パスワード・名前を自分で設定する）
require("dotenv").config({ path: ".env" });
const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const token = randomUUID();
  await prisma.user.create({
    data: { name: "招待中", email: `invite_${token}`, password: null, role: "PARTNER", inviteToken: token },
  });
  console.log(`https://denki-kanri.vercel.app/register/${token}`);
  await prisma.$disconnect();
})();
