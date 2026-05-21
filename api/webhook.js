const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

module.exports = async (req, res) => {
    // الرد الفوري المباشر لتلجرام لمنع التكرار نهائياً
    res.status(200).send('OK');

    if (req.method !== 'POST') return;

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    // حماية البوت: للمالك فقط
    if (userId !== OWNER_ID) return;

    if (text === '.start') {
        await sendTelegramMessage(chatId, "🕵️‍♂️ **نظام الفحص الفوري والمستقر النقي!**\n\nاكتب الآن:\n`.inspect 618512747` أو باليوزر المعرف مباشرة.");
        return;
    }

    if (text && text.startsWith('.inspect')) {
        let target = text.replace('.inspect', '').trim().replace(/[\[\]]/g, '');

        if (!target) {
            await sendTelegramMessage(chatId, "⚠️ يرجى كتابة الأيدي أو المعرف بعد الأمر.");
            return;
        }

        await sendTelegramMessage(chatId, `⏳ **جاري الفحص المباشر المستقر لـ [ ${target} ]...**`);

        // استخدام الـ HTTPS الخام لضمان عدم حدوث fetch failed نهائياً
        const postData = JSON.stringify({ chat_id: target });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/getChat`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            },
            timeout: 8000 // 8 ثواني قطع اتصال كحد أقصى
        };

        const telegramReq = https.request(options, (telegramRes) => {
            let body = '';
            telegramRes.on('data', (chunk) => { body += chunk; });
            telegramRes.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (data.ok) {
                        const chat = data.result;
                        const accountId = chat.id ? chat.id.toString() : target;
                        const title = chat.title || `${chat.first_name || ""} ${chat.last_name || ""}`.trim() || "بدون اسم";
                        const username = chat.username ? `@${chat.username}` : "لا يوجد معرف حالياً";
                        const bio = chat.bio || chat.description || "لا يوجد بايو/وصف مكتوب";

                        let type = "👤 حساب مستخدم (User)";
                        if (chat.type === 'channel') type = "📢 قناة رسمية (Channel)";
                        if (chat.type === 'supergroup') type = "👥 مجموعة خارقة (Supergroup)";
                        if (chat.type === 'group') type = "👥 مجموعة عادية (Group)";

                        let report = `📊 **التقرير التقني المضمون:**\n\n`;
                        report += `🏷️ **الاسم:** \`${title}\`\n`;
                        report += `🆔 **الآيدي الثابت:** \`${accountId}\`\n`;
                        report += `🌐 **المعرف الحالي:** ${username}\n`;
                        report += `🗂️ **نوع الكيان:** \`${type}\`\n`;
                        report += `📝 **البايو/الوصف:** _${bio}_\n\n`;
                        report += `✅ **حالة الحساب:** مستقر وجلب حي من السيرفر بنجاح.`;

                        await sendTelegramMessage(chatId, report);
                    } else {
                        await sendTelegramMessage(chatId, `❌ **تلجرام يرفض الجلب:** \`${data.description || "الحساب مجهول أو لم يتفاعل مع البوت"}\``);
                    }
                } catch (e) {
                    sendTelegramMessage(chatId, `❌ **خطأ بمعالجة البيانات:** \`${e.message}\``);
                }
            });
        });

        telegramReq.on('error', async (err) => {
            await sendTelegramMessage(chatId, `❌ **فشل الاتصال بالشبكة (Network Error):** \`${err.message}\``);
        });

        telegramReq.on('timeout', async () => {
            telegramReq.destroy();
            await sendTelegramMessage(chatId, `❌ **انتهت مهلة الطلب (Timeout) مع سيرفر تلجرام.**`);
        });

        telegramReq.write(postData);
        telegramReq.end();
    }
};

// دالة الإرسال عبر الـ HTTPS الخام لضمان الاستقرار
async function sendTelegramMessage(chatId, messageText) {
    const postData = JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" });
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${process.env.BOT_TOKEN.trim()}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };
    const req = https.request(options);
    req.write(postData);
    req.end();
}
