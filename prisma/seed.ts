import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin1234", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@denki.com" },
    update: {},
    create: {
      name: "管理者",
      email: "admin@denki.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log("✅ 管理者アカウント作成完了");
  console.log("  メール: admin@denki.com");
  console.log("  パスワード: admin1234");
  console.log("  ID:", admin.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
