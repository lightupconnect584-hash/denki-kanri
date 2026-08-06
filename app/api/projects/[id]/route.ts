import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncSalesEntryForProject, currentMonthKey } from "@/lib/salesSync";
import { stripPostal } from "@/lib/stripPostal";
import { syncProjectToGoogle, deleteProjectFromGoogle } from "@/lib/googleCalendar";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  const { id } = await params;

  // 協力会社は自分が担当（主担当 or 共同担当）の案件のみ閲覧可
  const project = await prisma.project.findFirst({
    where: role === "PARTNER"
      ? { id, OR: [{ assignedToId: userId }, { subAssignees: { some: { userId } } }] }
      : { id },
    include: {
      client: { select: { id: true, name: true, color: true } },
      assignedTo: { select: { id: true, name: true, companyName: true, email: true, phone: true, color: true, avatarUrl: true } },
      subAssignees: { select: { amount: true, user: { select: { id: true, name: true, companyName: true, phone: true, color: true, avatarUrl: true } } } },
      createdBy: { select: { name: true, avatarUrl: true, phone: true, thankYouEnabled: true, thankYouImageUrl: true } },
      projectPhotos: true,
      invoices: {
        include: { uploadedBy: { select: { name: true, companyName: true } } },
        orderBy: { createdAt: "desc" },
      },
      inspections: {
        include: {
          photos: true,
          inspector: { select: { name: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      quotes: {
        include: {
          submittedBy: { select: { name: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      comments: {
        select: {
          id: true, content: true, createdAt: true, authorId: true, readAt: true,
          author: { select: { name: true, companyName: true, role: true, avatarUrl: true, phone: true } },
          reactions: { select: { emoji: true, userId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      activityLogs: {
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // 共同担当を平坦化（応援費は本人と管理者のみ閲覧可）
  const flat = {
    ...project,
    subAssignees: project.subAssignees.map((sa) => ({ ...sa.user, amount: sa.amount })),
  };
  // 協力会社には売上（積水請求額）・材料費・管理者メモを見せない（協力会社メモは見せる）
  if (role === "PARTNER") {
    const { salesAmount: _s, materialCost: _m, managerName: _mn, afterManagerName: _an, memo: _memo, sekisuiNumber: _sn, client: _cl, ...rest } = flat as typeof flat & { salesAmount: number | null; materialCost: number | null; managerName: string | null; afterManagerName: string | null; memo: string | null; sekisuiNumber: string | null };
    void _s; void _m; void _mn; void _an; void _memo; void _sn; void _cl;
    // 依頼書原本の添付は協力会社に見せない（自社案件を後から付け替えた場合の保険）
    rest.projectPhotos = rest.projectPhotos.filter((ph) => !ph.originalName.includes("依頼書原本"));
    // 応援費: 自分の分だけ見える。共同担当として見ている場合は「金額」も自分の応援費に置き換え
    const isMain = rest.assignedToId === userId;
    const mySub = rest.subAssignees.find((u) => u.id === userId);
    const subAssignees = rest.subAssignees.map((u) => ({ ...u, amount: u.id === userId ? u.amount : null }));
    const amount = isMain ? rest.amount : mySub ? (mySub.amount ?? null) : rest.amount;
    return NextResponse.json({ ...rest, amount, subAssignees });
  }
  // 管理者には協力会社メモを見せない（各自専用）
  const { partnerMemo: _pm, ...adminView } = flat as typeof flat & { partnerMemo: string | null };
  void _pm;
  return NextResponse.json(adminView);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  await deleteProjectFromGoogle(id).catch(() => {});
  await prisma.activityLog.deleteMany({ where: { projectId: id } });
  await prisma.comment.deleteMany({ where: { projectId: id } });
  await prisma.photo.deleteMany({ where: { inspection: { projectId: id } } });
  await prisma.inspection.deleteMany({ where: { projectId: id } });
  await prisma.quote.deleteMany({ where: { projectId: id } });
  await prisma.projectPhoto.deleteMany({ where: { projectId: id } });
  await prisma.invoice.deleteMany({ where: { projectId: id } });
  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const role = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) {
    updateData.status = body.status;
    // ボタンを押したタイミング＝相手側に通知（全ステータス変更が対象）
    if (role === "ADMIN") updateData.notifyPartnerAt = new Date();
    if (role === "PARTNER") updateData.notifyAdminAt = new Date();
  }
  // 担当変更（再アサイン）→ 協力会社に通知
  if (body.assignedToId !== undefined) {
    updateData.assignedToId = body.assignedToId !== "" ? body.assignedToId : null;
    if (role === "ADMIN" && body.assignedToId) updateData.notifyPartnerAt = new Date();
  }
  // 共同担当の設定（管理者のみ）。配列で全置き換え＋応援費（subAssigneeAmounts: {userId: 金額}）
  if (Array.isArray(body.subAssigneeIds) && role === "ADMIN") {
    const ids: string[] = body.subAssigneeIds.filter((v: unknown) => typeof v === "string" && v);
    const amounts: Record<string, unknown> = body.subAssigneeAmounts && typeof body.subAssigneeAmounts === "object" ? body.subAssigneeAmounts : {};
    await prisma.projectSubAssignee.deleteMany({ where: { projectId: id, ...(ids.length ? { userId: { notIn: ids } } : {}) } });
    for (const uid of ids) {
      const raw = amounts[uid];
      const amt = raw !== undefined && raw !== null && String(raw) !== "" ? parseInt(String(raw)) || null : null;
      await prisma.projectSubAssignee.upsert({
        where: { projectId_userId: { projectId: id, userId: uid } },
        update: { amount: amt },
        create: { projectId: id, userId: uid, amount: amt },
      });
    }
    if (ids.length > 0) updateData.notifyPartnerAt = new Date();
    // 売上集計に計上済みの案件は、外注費（主担当の金額＋応援費）を追従させる
    const entry = await prisma.salesEntry.findUnique({ where: { projectId: id }, select: { id: true } });
    if (entry) {
      const proj = await prisma.project.findUnique({ where: { id }, select: { amount: true, assignedToId: true } });
      let selfAssigned = false;
      if (proj?.assignedToId) {
        const a = await prisma.user.findUnique({ where: { id: proj.assignedToId }, select: { role: true } });
        selfAssigned = a?.role === "ADMIN";
      }
      const agg = await prisma.projectSubAssignee.aggregate({ where: { projectId: id }, _sum: { amount: true } });
      await prisma.salesEntry.update({
        where: { id: entry.id },
        data: { outsource: (selfAssigned ? 0 : (proj?.amount ?? 0)) + (agg._sum.amount ?? 0) },
      });
    }
  }

  // 保留の設定/解除（管理者・担当協力会社どちらも可）
  if (body.onHold !== undefined) {
    const hold = Boolean(body.onHold);
    updateData.onHold = hold;
    updateData.holdReason = hold ? String(body.holdReason || "").slice(0, 100) || null : null;
    updateData.holdAt = hold ? new Date() : null;
    updateData.holdByName = hold ? ((session.user as { name?: string }).name || null) : null;
    // 相手側に通知
    if (role === "ADMIN") updateData.notifyPartnerAt = new Date();
    if (role === "PARTNER") updateData.notifyAdminAt = new Date();
    // 活動ログ
    await prisma.activityLog.create({
      data: {
        projectId: id,
        userId,
        action: hold ? "HOLD" : "HOLD_RELEASED",
        detail: hold ? `保留: ${String(body.holdReason || "").slice(0, 100)}` : "保留を解除",
      },
    }).catch(() => {});
  }

  // 訪問予定日・時間帯は担当者（主担当・共同担当の協力会社、または管理者）のみ変更可
  if (body.visitDate !== undefined || body.visitTime !== undefined) {
    const project = await prisma.project.findUnique({ where: { id }, select: { assignedToId: true, status: true, subAssignees: { select: { userId: true } } } });
    const isAssignee = project?.assignedToId === userId || !!project?.subAssignees.some((u) => u.userId === userId);
    if ((isAssignee || role === "ADMIN") && ["PENDING", "ACCEPTED", "REWORK"].includes(project?.status ?? "")) {
      if (body.visitDate !== undefined) updateData.visitDate = body.visitDate ? new Date(body.visitDate) : null;
      if (body.visitTime !== undefined) updateData.visitTime = body.visitTime || null;
    }
  }
  // 編集フィールド（管理者が内容を変更した場合 → 協力会社に通知）
  const contentFields = ["title", "location", "roomNumber", "contractorName", "contractorPhone", "smsAllowed", "description", "urgency", "dueDate", "preferredContactAt", "preferredVisitAt", "materialSupplied", "receivedAt", "parkingInfo", "simpleReport", "region"];
  const contentEdited = role === "ADMIN" && contentFields.some(f => body[f] !== undefined);
  if (contentEdited) updateData.notifyPartnerAt = new Date();
  if (body.title !== undefined) updateData.title = body.title;
  if (body.location !== undefined) updateData.location = stripPostal(body.location);
  if (body.roomNumber !== undefined) updateData.roomNumber = body.roomNumber || null;
  if (body.workType !== undefined) updateData.workType = body.workType || null;
  if (body.contractorName !== undefined) updateData.contractorName = body.contractorName || null;
  if (body.contractorPhone !== undefined) updateData.contractorPhone = body.contractorPhone || null;
  if (body.smsAllowed !== undefined) updateData.smsAllowed = body.smsAllowed;
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.urgency !== undefined) updateData.urgency = body.urgency;
  if (body.materialSupplied !== undefined) updateData.materialSupplied = Boolean(body.materialSupplied);
  if (body.simpleReport !== undefined) updateData.simpleReport = Boolean(body.simpleReport);
  // 売上・材料費（管理者のみ・協力会社には非公開）
  if (body.salesAmount !== undefined && role === "ADMIN") {
    updateData.salesAmount = body.salesAmount !== "" && body.salesAmount !== null ? parseInt(body.salesAmount) : null;
  }
  if (body.materialCost !== undefined && role === "ADMIN") {
    updateData.materialCost = body.materialCost !== "" && body.materialCost !== null ? parseInt(body.materialCost) : null;
  }
  if (body.sekisuiNumber !== undefined && role === "ADMIN") updateData.sekisuiNumber = body.sekisuiNumber || null;
  if (body.managerName !== undefined && role === "ADMIN") updateData.managerName = body.managerName || null;
  if (body.afterManagerName !== undefined && role === "ADMIN") updateData.afterManagerName = body.afterManagerName || null;
  // 請求月の上書き（管理者のみ）
  if (body.billingMonth !== undefined && role === "ADMIN") {
    updateData.billingMonth = body.billingMonth || null;
  }
  if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.preferredContactAt !== undefined) updateData.preferredContactAt = body.preferredContactAt || null;
  if (body.preferredVisitAt !== undefined) updateData.preferredVisitAt = body.preferredVisitAt || null;
  if (body.moveInDate !== undefined) updateData.moveInDate = body.moveInDate || null;
  if (body.receivedAt !== undefined) updateData.receivedAt = body.receivedAt || null;
  if (body.parkingInfo !== undefined) updateData.parkingInfo = body.parkingInfo || null;
  if (body.region !== undefined) updateData.region = body.region || null;
  if (body.clientId !== undefined && role === "ADMIN") updateData.clientId = body.clientId || null;
  if (body.contactRequired !== undefined && role === "ADMIN") updateData.contactRequired = Boolean(body.contactRequired);
  // 入居者と連絡が取れた／取り消し（担当者・管理者）
  if (body.contacted !== undefined) {
    const method = body.contacted
      ? (body.contactMethod === "note" ? "note" : body.contactMethod === "sms" ? "sms" : "appointment")
      : null;
    updateData.contactedAt = body.contacted ? new Date() : null;
    updateData.contactMethod = method;
    await prisma.activityLog.create({
      data: {
        projectId: id,
        userId,
        action: "CONTACT_ATTEMPT",
        detail: body.contacted
          ? (method === "note" ? "📮 完了後メモ投函予定にした（共用部・不出のため）" : method === "sms" ? "💬 SMSで連絡（アポ完了）" : "✓ アポイントが取れた")
          : "アポイント記録を取り消し",
      },
    }).catch(() => {});
  }
  // 連絡試行の記録（電話不出・SMS送信など）
  if (body.contactAttempt !== undefined) {
    await prisma.activityLog.create({
      data: {
        projectId: id,
        userId,
        action: "CONTACT_ATTEMPT",
        detail: String(body.contactAttempt).slice(0, 50),
      },
    }).catch(() => {});
  }
  // メモ（各自専用・相手には非公開・通知は出さない）
  if (body.memo !== undefined && role === "ADMIN") updateData.memo = body.memo || null;
  if (body.partnerMemo !== undefined && role === "PARTNER") updateData.partnerMemo = body.partnerMemo || null;

  // 金額変更は管理者のみ・変更履歴を記録
  let oldAmount: number | null = null;
  if (body.amount !== undefined && role === "ADMIN") {
    const current = await prisma.project.findUnique({ where: { id }, select: { amount: true } });
    oldAmount = current?.amount ?? null;
    const newAmount = body.amount !== undefined && body.amount !== "" && body.amount !== null ? parseInt(body.amount) : null;
    updateData.amount = newAmount;
  }

  // 協力会社は自分の案件のみ操作可
  const whereClause = role === "PARTNER" ? { id, assignedToId: userId } : { id };
  const project = await prisma.project.update({
    where: whereClause,
    data: updateData,
  });

  // 完了になったら売上集計に自動登録
  // 計上月は「請求月の上書き > 作業日（最新の完了報告）> 今月」の順で決める
  // （月をまたいで完了ボタンを押しても、先月の作業は先月の売上に入る）
  if (["CONFIRMED", "COMPLETED"].includes(body.status)) {
    let ym = project.billingMonth || "";
    if (!ym) {
      const insp = await prisma.inspection.findMany({
        where: { projectId: project.id },
        select: { workDate: true },
      });
      if (insp.length > 0) {
        const d = insp.reduce((a, b) => (a > b.workDate ? a : b.workDate), insp[0].workDate);
        ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
    }
    await syncSalesEntryForProject(
      { id: project.id, title: project.title, location: project.location, amount: project.amount, assignedToId: project.assignedToId, salesAmount: project.salesAmount, materialCost: project.materialCost, region: project.region, clientId: project.clientId },
      ym || currentMonthKey()
    );
  }

  // 金額変更ログ
  if (body.amount !== undefined && role === "ADMIN") {
    const newAmount = body.amount !== undefined && body.amount !== "" && body.amount !== null ? parseInt(body.amount) : null;
    const oldStr = oldAmount != null ? `¥${oldAmount.toLocaleString()}` : "未設定";
    const newStr = newAmount != null ? `¥${newAmount.toLocaleString()}` : "未設定";
    if (oldAmount !== newAmount) {
      await prisma.activityLog.create({
        data: {
          projectId: id,
          userId,
          action: "AMOUNT_CHANGED",
          detail: `${oldStr} → ${newStr}`,
        },
      });
    }
  }

  // Googleカレンダーへ即時反映（訪問日・時間・担当・ステータスの変化を同期）
  if (body.visitDate !== undefined || body.visitTime !== undefined || body.assignedToId !== undefined || body.status !== undefined) {
    await syncProjectToGoogle(id).catch(() => {});
  }

  // 協力会社には売上・材料費・管理者情報を返さない（GETと同じサニタイズ）
  if (role === "PARTNER") {
    const { salesAmount: _s, materialCost: _m, managerName: _mn, afterManagerName: _an, memo: _memo, sekisuiNumber: _sn, ...rest } = project;
    void _s; void _m; void _mn; void _an; void _memo; void _sn;
    return NextResponse.json(rest);
  }
  return NextResponse.json(project);
}
