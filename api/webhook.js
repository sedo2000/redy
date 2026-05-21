const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات من بيئة فيرسل حصراً ] ===
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

let allowedAdmins = [OWNER_ID]; 

// دالة تشغيل الـ Userbot لقراءة القناة
async function markChannelAsRead(channelUrl) {
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 2,
    });
    
    try {
        await client.connect();
        const channelEntity = await client.getEntity(channelUrl);
        
        // إرسال طلب تحديد القناة كمقروءة
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

// استقبال طلبات الـ Webhook من تلجرام
app.post('*', async (req, res) => {
    res.status(200).send('OK'); // الرد الفوري لمنع التكرار

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    if (!text) return;

    // التحقق من الصلاحية (للمالك والمسؤولين فقط)
    if (!allowedAdmins.includes(userId)) return;

    // استقبال الأوامر وروابط القنوات
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
