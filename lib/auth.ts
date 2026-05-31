import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

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
      }
      // roleが欠落している場合はDBから補完（セッション作成時期の差異対策）
      if (!token.role && token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { role: true, companyName: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            if (!token.companyName) token.companyName = dbUser.companyName;
          }
        } catch {
          // DB参照失敗時はセッション自体を壊さない
        }
      }
      // update() 呼び出し時にトークンを更新
      if (trigger === "update") {
        if (session?.avatarUrl !== undefined) token.avatarUrl = session.avatarUrl;
        if (session?.phone !== undefined) token.phone = session.phone;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string; role: string; companyName?: string; avatarUrl?: string; phone?: string }).id = token.sub!;
        (session.user as { role: string }).role = token.role as string;
        (session.user as { companyName?: string }).companyName = token.companyName as string;
        (session.user as { avatarUrl?: string }).avatarUrl = token.avatarUrl as string;
        (session.user as { phone?: string }).phone = token.phone as string;
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
