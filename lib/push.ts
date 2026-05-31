import webpush from "web-push";
import { prisma } from "./prisma";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushToUsers(userIds: string[], payload: { title: string; body: string; url?: string }) {
  if (!userIds.length) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  const message = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        );
      } catch (err: unknown) {
        // 無効なサブスクリプションは削除
        if ((err as { statusCode?: number }).statusCode === 410 || (err as { statusCode?: number }).statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}

// 管理者全員のIDを取得
export async function getAdminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  return admins.map((a) => a.id);
}
