const express = require('express');

const app = express();
app.use(express.json());

// جلب التوكن من البيئة
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

app.post('*', async (req, res) => {
    // الرد الفوري المباشر لتلجرام لمنع التكرار نهائياً
    res.status(200).send('OK');

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    // حماية البوت: للمالك فقط
    if (userId !== OWNER_ID) return;

    if (text === '.start') {
        await sendBotMessage(chatId, "🕵️‍♂️ **أهلاً بك في نظام الفحص الفوري والمستقر!**\n\nاكتب الآن:\n`.inspect 618512747` أو باليوزر المعرف مباشرة.");
        return;
    }

    if (text && text.startsWith('.inspect')) {
        let target = text.replace('.inspect', '').trim().replace(/[\[\]]/g, '');

        if (!target) {
            await sendBotMessage(chatId, "⚠️ يرجى كتابة الأيدي أو المعرف بعد الأمر.");
            return;
        }

        await sendBotMessage(chatId, `⏳ **جاري الفحص الصاروخي المباشر لـ [ ${target} ]...**`);

        try {
            // استدعاء ميثود getChat الرسمي من تلجرام وهو أسرع بـ 100 مرة ولا يحتاج سيزن آيدي
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: target })
            });

            const data = await response.json();

            if (data.ok) {
                const chat = data.result;
                const accountId = chat.id ? chat.id.toString() : target;
                const title = chat.title || `${chat.first_name || ""} ${chat.last_name || ""}`.trim() || "بدون اسم";
                const username = chat.username ? `@${chat.username}` : "لا يوجد معرف حالياً";
                const bio = chat.bio || chat.description || "لا يوجد بايو/وصف مكتوب";

                // تحديد نوع الحساب
                let type = "👤 حساب مستخدم (User)";
                if (chat.type === 'channel') type = "📢 قناة رسمية (Channel)";
                if (chat.type === 'supergroup') type = "👥 مجموعة خارقة (Supergroup)";
                if (chat.type === 'group') type = "👥 مجموعة عادية (Group)";

                let report = `📊 **التقرير التقني المستخرج فوراً:**\n\n`;
                report += `🏷️ **الاسم الحركي:** \`${title}\`\n`;
                report += `🆔 **الآيدي الثابت:** \`${accountId}\`\n`;
                report += `🌐 **المعرف الحالي:** ${username}\n`;
                report += `🗂️ **نوع الكيان:** \`${type}\`\n`;
                report += `📝 **البايو/الوصف:** _${bio}_\n\n`;
                report += `✅ **حالة الاتصال:** السيرفر مستقر والحساب متاح ببياناته الرسمية حية.`;

                await sendBotMessage(chatId, report);
            } else {
                // إذا لم يجد البوت الحساب، نحاول جلب تقريب مبسط إذا كان آيدي
                await sendBotMessage(chatId, `❌ **لم يعثر البوت على بيانات مباشرة.**\nالسبب: \`${data.description || "الحساب غير متفاعل مع البوت أو خاص"}\``);
            }
        } catch (err) {
            await sendBotMessage(chatId, `❌ **خطأ أثناء جلب البيانات:** \`${err.message}\``);
        }
    }
});

// دالة إرسال الرسائل
async function sendBotMessage(chatId, messageText) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" })
    }).catch(() => {});
}

module.exports = app;
