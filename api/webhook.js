const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات الحساسة من بيئة فيرسل حصراً ] ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_ID = parseInt(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const STRING_SESSION = process.env.STRING_SESSION;
const OWNER_ID = parseInt(process.env.OWNER_ID);

// مصفوفة المسؤولين المصرح لهم (تبدأ بالمالك تلقائياً)
let allowedAdmins = [OWNER_ID]; 

// التحقق من وجود المتغيرات الأساسية لتجنب انهيار السيرفر
if (!BOT_TOKEN || !API_ID || !API_HASH || !STRING_SESSION || !OWNER_ID) {
    console.error("❌ خطأ: بعض المتغيرات البيئية (Environment Variables) مفقودة في فيرسل!");
}

// === [ 🤖 دالة تشغيل الـ Userbot لقراءة القناة ] ===
async function markChannelAsRead(channelUrl) {
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 2,
    });
    
    try {
        await client.connect();
        const channelEntity = await client.getEntity(channelUrl);
        
        // إرسال طلب قراءة المحتوى والتحديد كمقروء
        await client.invoke(
            new client.Api.channels.ReadHistory({
                channel: channelEntity,
                maxId: 0
            })
        );
        
        await client.disconnect();
        return { success: true, title: channelEntity.title || "القناة" };
    } catch (error) {
        try { await client.disconnect(); } catch(e){}
        return { success: false, error: error.message };
    }
}

// === [ 🌐 استقبال طلبات الـ Webhook من تلجرام ] ===
app.post('*', async (req, res) => {
    // الرد الفوري على سيرفرات تلجرام لمنع تكرار الطلب
    res.status(200).send('OK');

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = update.message.chat.id;
    const userId = update.message.from.id;
    const text = update.message.text;

    if (!text) return;

    // --- أمر إضافة مسؤول (للمالك فقط) ---
    if (text.startsWith('/addadmin') && userId === OWNER_ID) {
        const parts = text.split(' ');
        const targetId = parseInt(parts[1]);
        
        if (!isNaN(targetId) && !allowedAdmins.includes(targetId)) {
            allowedAdmins.push(targetId);
            await sendBotMessage(chatId, `✅ تم رفع العضو (${targetId}) كمسؤول بنجاح.`);
        } else {
            await sendBotMessage(chatId, `❌ الآيدي غير صحيح أو مضاف مسبقاً.`);
        }
        return;
    }

    // --- التحقق من الصلاحية للأوامر والقنوات ---
    if (!allowedAdmins.includes(userId)) {
        await sendBotMessage(chatId, "⚠️ عذراً، ليس لديك صلاحية لاستخدام هذا البوت.");
        return;
    }

    // --- استقبال روابط القنوات وتحديدها كمقروءة ---
    if (text.includes("t.me/") || text.startsWith("@")) {
        await sendBotMessage(chatId, "⏳ جاري الاتصال بحسابك وتحديد القناة كمقروءة...");
        
        const result = await markChannelAsRead(text);
        
        if (result.success) {
            await sendBotMessage(chatId, `✅ تم تحديد القناة [ ${result.title} ] كمقروءة بنجاح!`);
        } else {
            await sendBotMessage(chatId, `❌ حدث خطأ أثناء المحاولة:\n${result.error}`);
        }
    }
});

// دالة إرسال الرسائل عبر الـ Bot API الرسمي
async function sendBotMessage(chatId, messageText) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: messageText })
        });
    } catch (e) {
        console.error("Error sending message:", e);
    }
}

module.exports = app;
