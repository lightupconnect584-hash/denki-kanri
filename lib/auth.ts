import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

function isProfileComplete(user: {
  role: string;
  address?: string | null;
  birthDate?: Date | null;
  bloodType?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  color?: string | null;
}): boolean {
  if (user.role !== "PARTNER") return true;
  // companyName は新規パートナーのセットアップフォームで強制するが
  // 既存パートナーへの後付け強制を避けるためここでは除外
  return !!(user.address && user.birthDate && user.bloodType && user.emergencyName && user.emergencyPhone && user.color);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null; // 招待未完了ユーザーはログイン不可

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        const now = new Date();
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: now },
        });
        await prisma.loginLog.create({ data: { userId: user.id } });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyName: user.companyName,
          avatarUrl: user.avatarUrl,
          phone: user.phone,
          profileComplete: isProfileComplete(user),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.companyName = (user as any).companyName;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.avatarUrl = (user as any).avatarUrl;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.phone = (user as any).phone;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.profileComplete = (user as any).profileComplete;
      }
      // roleが欠落している場合はDBから補完（セッション作成時期の差異対策）
      if (!token.role && token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: {
              role: true, companyName: true,
              address: true, birthDate: true, bloodType: true,
              emergencyName: true, emergencyPhone: true, color: true,
            },
          });
          if (dbUser) {
            token.role = dbUser.role;
            if (!token.companyName) token.companyName = dbUser.companyName;
            if (token.profileComplete === undefined) {
              token.profileComplete = isProfileComplete(dbUser);
            }
          }
        } catch {
          // DB参照失敗時はセッション自体を壊さない
        }
      }
      // update() 呼び出し時にトークンを更新
      if (trigger === "update") {
        if (session?.avatarUrl !== undefined) token.avatarUrl = session.avatarUrl;
        if (session?.phone !== undefined) token.phone = session.phone;
        if (session?.profileComplete !== undefined) token.profileComplete = session.profileComplete;
        if (session?.companyName !== undefined) token.companyName = session.companyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string; role: string; companyName?: string; avatarUrl?: string; phone?: string; profileComplete?: boolean }).id = token.sub!;
        (session.user as { role: string }).role = token.role as string;
        (session.user as { companyName?: string }).companyName = token.companyName as string;
        (session.user as { avatarUrl?: string }).avatarUrl = token.avatarUrl as string;
        (session.user as { phone?: string }).phone = token.phone as string;
        (session.user as { profileComplete?: boolean }).profileComplete = token.profileComplete as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 365 * 24 * 60 * 60, // 1年
  },
};
