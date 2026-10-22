#!/usr/bin/env python3
# 作業単価表（協力会社向け・宛名入り）生成スクリプト
# 使い方: python3 scripts/make-price-pdf.py "◯◯電気工事様"
# 内容は2026-10-19にユーザー確定した版で固定。数字を変える時はITEMSを編集。
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from datetime import date

ADDRESSEE = sys.argv[1] if len(sys.argv) > 1 else ""

pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
F = "HeiseiKakuGo-W5"
NAVY = (0.13, 0.22, 0.38); ACCENT = (0.16, 0.42, 0.72); GRAY = (0.45, 0.45, 0.45)
LIGHT = (0.95, 0.96, 0.98); ORANGE = (0.8, 0.35, 0.05)

# ── 確定単価（2026-10-19 ユーザー確定版） ──
ITEMS = [
    ("共用ブレーカー落ち原因調査・復旧", "¥18,000", "¥15,000〜", "⚡ 至急対応（即日〜翌日）"),
    ("不点灯調査", "¥12,000", "¥9,000〜", ""),
    ("漏電調査", "¥15,000", "¥13,000〜", ""),
    ("現地点検", "¥10,000", "¥8,000〜", ""),
    ("管球交換", "¥10,000", "¥9,000〜", ""),
    ("IHコンロ交換", "¥20,000", "¥20,000〜", "材料支給（作業のみ）"),
    ("レンジフード交換", "¥25,000", "¥25,000〜", "材料支給（作業のみ）"),
    ("コンセント・スイッチ交換", "¥10,000", "¥9,000〜", ""),
    ("EEスイッチ交換", "¥19,000", "¥18,000〜", ""),
    ("漏電改修工事", "¥15,000〜", "", "原因・材料支給の有無により個別見積"),
]
ANTENNA = [
    ("・BSアンテナ交換", "¥35,000", "¥32,000〜"),
    ("・ブースター交換", "¥35,000", "¥32,000〜"),
    ("・その他の修理", "¥15,000〜60,000", ""),
]

name_part = ADDRESSEE.replace("様", "").replace(" ", "").replace("　", "") or "汎用"
out = f"作業単価表_{name_part}宛.pdf"
c = canvas.Canvas(out, pagesize=A4)
W, H = A4
M = 44

BAND = 92
c.setFillColorRGB(*NAVY); c.rect(0, H-BAND, W, BAND, stroke=0, fill=1)
c.setFillColorRGB(1,1,1); c.setFont(F, 19)
c.drawString(M, H-38, "作業単価表")
c.setFillColorRGB(0.8, 0.85, 0.92); c.setFont(F, 9)
c.drawRightString(W-M, H-36, f"{date.today().strftime('%Y年%m月')}時点・参考資料")
if ADDRESSEE:
    c.setFont(F, 9.5); c.setFillColorRGB(1, 0.95, 0.75)
    c.drawRightString(W-M, H-56, f"{ADDRESSEE} 限り（転載・再配布はご遠慮ください）")
c.setFillColorRGB(1,1,1); c.setFont(F, 9.5)
c.drawString(M, H-58, "light up connect ｜ 集合住宅の電気設備対応（調査・小修繕・交換工事）")
c.setFont(F, 8.5)
x = M
for t in ["税別", "交通費込み", "月末締め・翌月20日払い"]:
    w = c.stringWidth(t, F, 8.5) + 14
    c.setFillColorRGB(0.22, 0.33, 0.52)
    c.roundRect(x, H-82, w, 15, 7, stroke=0, fill=1)
    c.setFillColorRGB(0.92, 0.95, 1.0)
    c.drawString(x+7, H-78, t)
    x += w + 7

y = H - BAND - 20
def section(title):
    global y
    c.setFillColorRGB(*ACCENT); c.rect(M, y-2, 3.5, 12, stroke=0, fill=1)
    c.setFillColorRGB(*NAVY); c.setFont(F, 11); c.drawString(M+9, y, title)
    y -= 18

section("標準単価一覧")
cols = [M, M+238, M+318, M+392]
ROW = 16.2
c.setFillColorRGB(*LIGHT); c.rect(M, y-4, W-2*M, 15, stroke=0, fill=1)
c.setFont(F, 8.5); c.setFillColorRGB(*GRAY)
for x2,h in zip(cols, ["作業内容","標準単価","単価帯","備考"]):
    c.drawString(x2+4, y, h)
y -= ROW
for i, (name, mode, band, note) in enumerate(ITEMS):
    if i % 2 == 1:
        c.setFillColorRGB(0.975, 0.975, 0.98); c.rect(M, y-4.5, W-2*M, ROW-1, stroke=0, fill=1)
    c.setFillColorRGB(0.1,0.1,0.1); c.setFont(F, 9.5)
    nm = name
    while c.stringWidth(nm, F, 9.5) > 228: nm = nm[:-1]
    c.drawString(cols[0]+4, y, nm)
    c.setFont(F, 10.5); c.drawString(cols[1]+4, y, mode)
    c.setFont(F, 9); c.setFillColorRGB(*GRAY); c.drawString(cols[2]+4, y, band)
    if note.startswith("⚡"): c.setFillColorRGB(*ORANGE)
    c.drawString(cols[3]+4, y, note)
    y -= ROW

y -= 8
box_h = 76
c.setFillColorRGB(0.94, 0.96, 1.0); c.setStrokeColorRGB(0.6, 0.72, 0.88); c.setLineWidth(0.8)
c.roundRect(M, y-box_h+10, W-2*M, box_h, 6, stroke=1, fill=1)
yy = y - 4
c.setFillColorRGB(*NAVY); c.setFont(F, 10); c.drawString(M+10, yy, "TVアンテナ不具合調査")
c.setFont(F, 11); c.drawString(cols[1]+4, yy, "¥10,000")
c.setFont(F, 8.5); c.setFillColorRGB(*GRAY); c.drawString(cols[3]+4, yy, "異常なし・調査のみの場合")
yy -= 14
c.setFont(F, 8.8); c.setFillColorRGB(0.25,0.3,0.4)
c.drawString(M+10, yy, "現地で不具合が見つかった場合は、お電話のうえそのまま修理対応をお願いします（調査費込みで下記単価）")
yy -= 14
c.setFillColorRGB(0.1,0.1,0.1)
for nm, price, hb in ANTENNA:
    c.setFont(F, 9.3); c.drawString(M+16, yy, nm)
    c.setFont(F, 10); c.drawString(cols[1]+4, yy, price)
    if hb:
        c.setFont(F, 8.5); c.setFillColorRGB(*GRAY); c.drawString(cols[2]+4, yy, hb)
        c.setFillColorRGB(0.1,0.1,0.1)
    yy -= 13.5
y = y - box_h - 6

section("調査のあとの流れ（2通り）")
c.setFont(F, 9); c.setFillColorRGB(0.2,0.2,0.2)
for head, body in [
    ("①  その場で直せるもの", "TVアンテナ・管球交換など → 現地からお電話のうえ、そのまま修理まで対応いただきます。"),
    ("②  要見積のもの", "共用灯交換・漏電改修など → 調査後にお見積りを提出いただき、承認後にあらためて修理をご依頼します。"),
    ("", "調査費は調査分としてお支払いし、修理はご提出いただいた見積金額でのご依頼です。"),
]:
    if head:
        c.setFont(F, 9.3); c.setFillColorRGB(*NAVY); c.drawString(M+4, y, head)
        c.setFont(F, 9); c.setFillColorRGB(0.2,0.2,0.2); c.drawString(M+110, y, body)
    else:
        c.drawString(M+110, y, body)
    y -= 13.5
y -= 6

section("共通条件・補足")
c.setFont(F, 8.8); c.setFillColorRGB(0.2,0.2,0.2)
for t in [
    "・お支払いは月末締め・翌月20日払いです。",
    "・単価は基本的に交通費込みです（遠方等で個別調整が必要な場合はご相談ください）。",
    "・依頼内容以外の対応が必要になった場合や現地で判断に迷う場合は、必ず当社へご連絡のうえ対応してください。",
    "　（ご連絡なしでの部材交換・追加作業はお支払いの対象外となることがあります）",
    "・⚡マークの作業は停電等で入居者様の生活に支障が出ているため、即日〜翌日の至急対応をお願いする案件です。",
    "・単価は過去実績に基づく標準額です。現場条件（高所・部材・規模）により個別にご相談のうえ決定します。",
    "・「材料支給」の作業は当社が部材を用意し、作業費のみのお支払いです。それ以外は原則材工込みです。",
    "・夜間加算は⚡至急案件のみ対象です。夜間に至急対応をご依頼した場合（例: 19時にブレーカー復旧を依頼）は加算、",
    "　日中にご依頼した作業の対応が結果的に夜になった場合は原則加算なし（事情により応相談）です。",
    "・完了報告（写真・内容）や見積り提出は当社アプリから簡単にできます（スマホのみでOK・使い方はサポートします）。",
    "・対応エリア等の詳細は面談時にご相談させてください。",
]:
    c.drawString(M+4, y, t); y -= 12.5

c.setStrokeColorRGB(0.8,0.8,0.8); c.setLineWidth(0.5)
c.line(M, 36, W-M, 36)
c.setFont(F, 7.5); c.setFillColorRGB(0.55,0.55,0.55)
foot = "※ 本資料は参考情報であり、契約条件を確定するものではありません。"
if ADDRESSEE:
    foot += f"　{ADDRESSEE}向けに作成。"
c.drawString(M, 25, foot)
c.drawRightString(W-M, 25, "light up connect")
c.save()
print(out)
