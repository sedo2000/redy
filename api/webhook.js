const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات من بيئة فيرسل ] ===
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

// === [ 🛸 استقبال طلبات الـ Webhook ] ===
app.post('*', async (req, res) => {
    res.status(200).send('OK'); // الرد الفوري لمنع التكرار والـ Timeout

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    // الحماية والأمان: أنت فقط من يتحكم
    if (userId !== OWNER_ID) return;

    // 🌟 [ تشغيل وفحص أمر الفحص العميق .inspect ] 🌟
    if (text && text.startsWith('.inspect')) {
        const target = text.split(' ')[1];
        if (!target) {
            await sendBotMessage(chatId, "⚠️ **تنبيه:** يرجى كتابة (المعرف أو الآيدي الرقمي) بعد الأمر.\nمثال باليوزر: `.inspect @username`\nمثال بالآيدي: `.inspect 123456789`");
            return;
        }

        const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
            connectionRetries: 1,
            timeout: 12000
        });

        try {
            await client.connect();
            await sendBotMessage(chatId, `🔍 **جاري الفحص العميق واستخراج البيانات من خوادم تلجرام لـ [ ${target} ]...**`);

            let entity;
            
            // 🧠 ذكاء الفحص: التحقق هل المدخل آيدي رقمي أم معرف نصي
            if (/^\d+$/.test(target) || /^-?\d+$/.test(target)) {
                // إذا كان المدخل رقماً، يتم تحويله لـ BigInt ليفهمه تلجرام كـ ID
                const numericId = BigInt(target);
                entity = await client.getEntity(numericId);
            } else {
                // إذا كان المدخل يوزر يبدأ بـ @ أو رابط
                entity = await client.getEntity(target);
            }

            if (entity) {
                // 1. تحديد نوع الحساب بدقة
                let type = "👤 مستخدم (User Account)";
                if (entity.className === 'Channel') {
                    type = entity.broadcast ? "📢 قناة رسمية (Channel)" : "👥 مجموعة خارقة (Supergroup)";
                } else if (entity.className === 'Chat') {
                    type = "👥 مجموعة عادية (Basic Group)";
                }

                // 2. تجميع البيانات الأساسية
                const accountId = entity.id ? entity.id.toString() : "غير معروف";
                const title = entity.title || `${entity.firstName || ""} ${entity.lastName || ""}`.trim() || "بدون اسم";
                const username = entity.username ? `@${entity.username}` : "لا يوجد معرف حالياً";
                
                // 3. كشف ميزة التحقق (الحسابات الموثقة)
                const isVerified = entity.verified ? "✅ موثق بنجمة زرقاء" : "❌ غير موثق";
                const isScam = entity.scam ? "⚠️ نعم (تحذير احتيال!)" : "✅ نظيف";
                const isFake = entity.fake ? "⚠️ نعم (حساب مزيف!)" : "✅ نظيف";

                // 4. كشف البلاغات والقيود الدولية (Restrictions)
                let restrictionReport = "✅ لا توجد قيود أو بلاغات إدارية";
                if (entity.restrictionReason && entity.restrictionReason.length > 0) {
                    restrictionReport = entity.restrictionReason.map(r => `• ${r.platform}: ${r.reason}`).join('\n');
                }

                // 5. حساب تاريخ الإنشاء التقريبي (بناءً على النطاقات الرقمية للآيدي في تلجرام)
                let approximateCreation = "غير قادر على الحساب";
                if (entity.id) {
                    const idNum = Number(entity.id);
                    if (idNum < 200000000) approximateCreation = "قديم جداً (بين 2013 - 2015)";
                    else if (idNum < 500000000) approximateCreation = "متوسط العمر (بين 2016 - 2017)";
                    else if (idNum < 1000000000) approximateCreation = "حديث نسبياً (بين 2018 - 2019)";
                    else if (idNum < 2000000000) approximateCreation = "جديد (بين 2020 - 2022)";
                    else approximateCreation = "جديد جداً (بين 2023 - 2026)";
                }

                // صياغة التقرير التقني النهائي الفخم
                let report = `📊 **التقرير الفني العميق للمُعرّف (Metadata):**\n\n`;
                report += `🏷️ **الاسم الحركي:** \`${title}\`\n`;
                report += `🆔 **الآيدي الثابت (ID):** \`${accountId}\`\n`;
                report += `🌐 **المعرف الحالي:** ${username}\n`;
                report += `🗂️ **تصنيف الكيان:** \`${type}\`\n`;
                report += `⏳ **تاريخ الإنشاء التقريبي:** \`${approximateCreation}\`\n`;
                report += `⭐️ **حالة التوثيق:** ${isVerified}\n\n`;
                
                report += `🚨 **مؤشرات الأمان والبلاغات:**\n`;
                report += `• نظام كاشف الاحتيال (Scam): ${isScam}\n`;
                report += `• نظام كاشف التزييف (Fake): ${isFake}\n`;
                report += `• القيود والحظر الإداري:\n_${restrictionReport}_\n\n`;
                report += `💡 _ملاحظة: إذا قام الشخص بتغيير يوزره، يمكنك تتبع اسمه الجديد دائماً عبر وضع الآيدي الثابت الخاص به._`;

                await sendBotMessage(chatId, report);
            } else {
                await sendBotMessage(chatId, "❌ **فشل:** لم يتم العثور على أي بيانات لهذا الهدف.");
            }

            await client.disconnect();
        } catch (error) {
            console.error("Error in inspect command:", error);
            await sendBotMessage(chatId, `❌ **فشل الفحص:** قد يكون الحساب محذوفاً تماماً، أو أن الآيدي خاطئ.\nتفاصيل الخطأ: \`${error.message}\``);
            try { await client.disconnect(); } catch(e){}
        }
        return;
    }
});

// دالة إرسال الرسائل النصية المنسقة
async function sendBotMessage(chatId, messageText) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" })
        });
    } catch (e) {
        console.error("Error sending bot message:", e);
    }
}

module.exports = app;
