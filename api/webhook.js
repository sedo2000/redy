const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات الحساسة من بيئة فيرسل حصراً ] ===
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";

// تحويل OWNER_ID إلى رقم بشكل صارم وتنظيفه
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

// مصفوفة المسؤولين المصرح لهم (تبدأ بالمالك تلقائياً)
let allowedAdmins = [OWNER_ID]; 

// التحقق من وجود المتغيرات الأساسية في السيرفر
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
                maxId: 0 // 0 تعني قراءة كل الرسائل غير المقروءة حالياً
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

    // تحويل الـ IDs القادمة من تلجرام إلى أرقام بشكل صريح للضمان
    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

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
        return; // تجاهل تماماً أي شخص غريب غير مضاف لحماية البوت الحساب
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
