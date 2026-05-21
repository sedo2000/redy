const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات التقنية من بيئة فيرسل ] ===
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

// === [ 🛸 استقبال طلبات الـ Webhook التلقائية ] ===
app.post('*', async (req, res) => {
    res.status(200).send('OK'); // الرد الفوري لتلجرام لمنع الـ Timeout وتكرار الرسائل

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    // الحماية والأمان: البوت لا يستجيب إلا لك حصراً بصفتك المالك
    if (userId !== OWNER_ID) return;

    // 🌟 [ رسالة الترحيب والتعليمات ] 🌟
    if (text === '.start') {
        const welcomeMessage = `🕵️‍♂️ **مرحباً بك في بوت مستخرج جهات الاتصال والأرقام الخفية!**

المنظومة مجهزة ومضبوطة بنظام النقطة المألوف لك:

🔍 **لاستخراج رقم وبيانات أي حساب:**
← اكتب الأمر متبوعاً بالمعرف (اليوزر)، مثل:
\`.phone @username\`

✨ _تم ضبط الكود ليعمل بنظام المعالجة الفورية الخفيفة عبر Vercel._`;
        
        await sendBotMessage(chatId, welcomeMessage);
        return;
    }

    // 🌟 [ ضبط الميزة: استخراج بطاقة الاتصال والرقم الخفي ] 🌟
    if (text && text.startsWith('.phone')) {
        const target = text.split(' ')[1];
        if (!target) {
            await sendBotMessage(chatId, "⚠️ **تنبيه:** يرجى كتابة المعرف (اليوزر) بعد الأمر.\nمثال: `.phone @username`");
            return;
        }

        // إنشاء جلسة سريعة ومؤقتة عبر السيزن آيدي لحسابك الشخصي
        const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
            connectionRetries: 1,
            timeout: 10000 // قطع الاتصال فوراً بعد 10 ثوانٍ لحماية السيرفر
        });

        try {
            await client.connect();
            await sendBotMessage(chatId, `⏳ **جاري الفحص البرمجي لـ ${target} وجلب البيانات الخفية...**`);

            // جلب الكيان الكامل للحساب المستهدف عبر التلجرام
            const userEntity = await client.getEntity(target);

            if (userEntity) {
                const firstName = userEntity.firstName || "";
                const lastName = userEntity.lastName || "";
                const fullName = `${firstName} ${lastName}`.trim() || "بدون اسم مسجل";
                const username = userEntity.username ? `@${userEntity.username}` : "لا يوجد";
                const userIdStr = userEntity.id ? userEntity.id.toString() : "غير معروف";
                
                // جلب الرقم الخفي الموثق بداخل سيرفرات تلجرام للحساب
                const phoneNumber = userEntity.phone ? `+${userEntity.phone}` : null;

                let report = `🕵️‍♂️ **تم استخراج بيانات البطاقة الشخصية بنجاح:**\n\n`;
                report += `👤 **الاسم المسجل:** ${fullName}\n`;
                report += `🆔 **آيدي الحساب (ID):** \`${userIdStr}\`\n`;
                report += `🌐 **المعرف الحالي:** ${username}\n`;
                
                if (phoneNumber) {
                    report += `📱 **الرقم الخفي المستخرج:** \`${phoneNumber}\`\n\n`;
                    report += `✅ _تمت مطابقة البيانات وسحب الرقم بنجاح عبر بروتوكول جهات الاتصال._`;
                } else {
                    report += `📱 **الرقم الخفي المستخرج:** \`مخفي تماماً للعامة\`\n\n`;
                    report += `💡 _هذا الشخص يغلق خصوصية الرقم بالكامل ولم يشارك كارت اتصاله معك أو مع أي جروب مشترك سابقاً._`;
                }

                await sendBotMessage(chatId, report);
            } else {
                await sendBotMessage(chatId, "❌ **فشل:** لم يتم العثور على هذا الحساب، تأكد من صحة اليوزر.");
            }

            // إغلاق الجلسة فوراً لتوفير موارد السيرفر وضمان الاستقرار
            await client.disconnect();

        } catch (error) {
            console.error("Error in phone command:", error);
            await sendBotMessage(chatId, `❌ **حدث خطأ تقني أثناء الفحص:**\n${error.message}`);
            try { await client.disconnect(); } catch(e){}
        }
        return;
    }
});

// دالة إرسال الرسائل النصية المنسقة عبر البوت الرسمي
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
