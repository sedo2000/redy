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
    res.status(200).send('OK'); // الرد الفوري لمنع التكرار

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    // الحماية والأمان: المالك فقط
    if (userId !== OWNER_ID) return;

    if (text === '.start') {
        const welcomeMessage = `🕵️‍♂️ **مرحباً بك في بوت كاشف التعديلات العميق المطور!**

🔍 **لفحص أي حساب أو قناة:**
← اكتب الأمر متبوعاً بالمعرف أو الآيدي، مثل:
\`.inspect @username\`
\`.inspect 618512747\`

✨ _تم تنظيف الفحص ليعمل الصاروخ بدون أي تعليق._`;
        await sendBotMessage(chatId, welcomeMessage);
        return;
    }

    // 🌟 [ تشغيل الفحص العميق المطور ] 🌟
    if (text && text.startsWith('.inspect')) {
        let target = text.replace('.inspect', '').trim();
        
        // 🧼 تنظيف المدخلات تلقائياً من الأقواس المربعية [ ] إذا كتبها المستخدم خطأً
        target = target.replace(/[\[\]]/g, '');

        if (!target) {
            await sendBotMessage(chatId, "⚠️ يرجى كتابة (المعرف أو الآيدي) بعد الأمر.\nمثال: `.inspect @username` أو `.inspect 618512747`");
            return;
        }

        const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
            connectionRetries: 1,
            timeout: 10000
        });

        try {
            await client.connect();
            await sendBotMessage(chatId, `🔍 **جاري الفحص السريع واستخراج البيانات لـ [ ${target} ]...**`);

            let entity;
            
            // الفحص الآمن لمعالجة الأرقام والآيديهات الكبيرة
            if (/^-?\d+$/.test(target)) {
                try {
                    // محاولة جلب الكيان عبر الآيدي المباشر كمستخدم أو قناة
                    entity = await client.getEntity(BigInt(target));
                } catch (e) {
                    // حل بديل وجبار إذا كان الحساب غير مخزن محلياً في الجلسة
                    entity = await client.getInputEntity(BigInt(target)).catch(() => null);
                }
            } else {
                // الفحص عبر اليوزر المباشر
                entity = await client.getEntity(target);
            }

            if (entity) {
                // تحديد التصنيف
                let type = "👤 مستخدم (User)";
                if (entity.className === 'Channel') {
                    type = entity.broadcast ? "📢 قناة رسمية (Channel)" : "👥 مجموعة خارقة (Supergroup)";
                } else if (entity.className === 'Chat') {
                    type = "👥 مجموعة عادية (Group)";
                }

                const accountId = entity.id ? entity.id.toString() : target;
                const title = entity.title || `${entity.firstName || ""} ${entity.lastName || ""}`.trim() || "بدون اسم";
                const username = entity.username ? `@${entity.username}` : "لا يوجد معرف حالياً";
                
                const isVerified = entity.verified ? "✅ موثق" : "❌ غير موثق";
                const isScam = entity.scam ? "⚠️ نعم (احتيال)" : "✅ نظيف";
                const isFake = entity.fake ? "⚠️ نعم (مزيف)" : "✅ نظيف";

                let restrictionReport = "✅ لا توجد قيود دولية";
                if (entity.restrictionReason && entity.restrictionReason.length > 0) {
                    restrictionReport = entity.restrictionReason.map(r => `• ${r.platform}: ${r.reason}`).join('\n');
                }

                // حساب تقريبي للآيدي
                let ageInfo = "حديث جداً (2023 - 2026)";
                const idNum = Number(entity.id);
                if (idNum < 500000000) ageInfo = "قديم جداً (2013 - 2017)";
                else if (idNum < 1500000000) ageInfo = "متوسط العمر (2018 - 2021)";

                let report = `📊 **التقرير الفني المستخرج بنجاح:**\n\n`;
                report += `🏷️ **الاسم:** \`${title}\`\n`;
                report += `🆔 **الآيدي الثابت:** \`${accountId}\`\n`;
                report += `🌐 **المعرف:** ${username}\n`;
                report += `🗂️ **النوع:** \`${type}\`\n`;
                report += `⏳ **عمر الحساب التقريبي:** \`${ageInfo}\`\n`;
                report += `⭐️ **التوثيق:** ${isVerified}\n\n`;
                report += `🚨 **مؤشرات الأمان:**\n• Scam: ${isScam}\n• Fake: ${isFake}\n• القيود: _${restrictionReport}_`;

                await sendBotMessage(chatId, report);
            } else {
                await sendBotMessage(chatId, "❌ لم يتم العثور على بيانات. قد يكون الآيدي خاطئاً أو الحساب محذوفاً تماماً.");
            }

            await client.disconnect();
        } catch (error) {
            console.error(error);
            await sendBotMessage(chatId, `❌ تعذر إكمال الفحص التقني.\nالسبب: \`${error.message}\``);
            try { await client.disconnect(); } catch(e){}
        }
        return;
    }
});

async function sendBotMessage(chatId, messageText) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" })
        });
    } catch (e) {
        console.error(e);
    }
}

module.exports = app;
