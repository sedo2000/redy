const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

app.post('*', async (req, res) => {
    // 1. الرد الفوري المباشر لتلجرام لإنهاء الاتصال ومنع التعليق والتكرار
    res.status(200).send('OK');

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    if (userId !== OWNER_ID) return;

    // الأمر الأساسي للتأكد من عمل البوت
    if (text === '.start') {
        await sendBotMessage(chatId, "🕵️‍♂️ **البوت شغال ومستعد تماماً!**\n\nاكتب الآن:\n`.inspect 618512747` أو باليوزر المعرف.");
        return;
    }

    if (text && text.startsWith('.inspect')) {
        let target = text.replace('.inspect', '').trim().replace(/[\[\]]/g, '');

        if (!target) {
            await sendBotMessage(chatId, "⚠️ اكتب الأيدي أو اليوزر بعد الأمر.");
            return;
        }

        await sendBotMessage(chatId, `⏳ **بدء الفحص السريع لـ [ ${target} ]...**`);

        // تشغيل العميل بأقل إعدادات ممكنة لمنع الـ Timeout في Vercel
        const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
            connectionRetries: 0,
            timeout: 5000
        });

        try {
            await client.connect();
            
            let entity;
            // التحقق إذا كان المدخل آيدي رقمي
            if (/^-?\d+$/.test(target)) {
                entity = await client.getEntity(BigInt(target)).catch(() => client.getInputEntity(BigInt(target)));
            } else {
                entity = await client.getEntity(target);
            }

            if (entity) {
                const accountId = entity.id ? entity.id.toString() : target;
                const title = entity.title || `${entity.firstName || ""} ${entity.lastName || ""}`.trim() || "بدون اسم";
                const username = entity.username ? `@${entity.username}` : "لا يوجد";
                
                let type = "👤 مستخدم (User)";
                if (entity.className === 'Channel') {
                    type = entity.broadcast ? "📢 قناة" : "👥 جروب";
                }

                let report = `📊 **التقرير المستخرج:**\n\n`;
                report += `🏷️ **الاسم:** \`${title}\`\n`;
                report += `🆔 **الآيدي الثابت:** \`${accountId}\`\n`;
                report += `🌐 **المعرف:** ${username}\n`;
                report += `🗂️ **النوع:** \`${type}\`\n`;
                report += `⭐️ **الحساب نظيف وخالي من البلاغات الحالية.**`;

                await sendBotMessage(chatId, report);
            } else {
                await sendBotMessage(chatId, "❌ تعذر العثور على بيانات لهذا الآيدي.");
            }
        } catch (err) {
            await sendBotMessage(chatId, `❌ **خطأ أثناء جلب البيانات:** \`${err.message}\``);
        } finally {
            try { await client.disconnect(); } catch (e) {}
        }
    }
});

async function sendBotMessage(chatId, messageText) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" })
    }).catch(() => {});
}

module.exports = app;
