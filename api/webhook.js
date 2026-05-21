const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات من بيئة فيرسل حصراً ] ===
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

// === [ 🌐 دالة قراءة القنوات - سريعة ومستقرة ] ===
async function markChannelAsRead(channelUrl) {
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 1,
        timeout: 10000 // مهلة 10 ثوانٍ كحد أقصى لمنع تعليق فيرسل
    });
    try {
        await client.connect();
        const channelEntity = await client.getEntity(channelUrl);
        await client.invoke(new Api.channels.ReadHistory({ channel: channelEntity, maxId: 0 }));
        await client.disconnect();
        return { success: true, title: channelEntity.title || "القناة" };
    } catch (error) {
        try { await client.disconnect(); } catch(e){}
        return { success: false, error: error.message };
    }
}

// === [ 🛸 استقبال طلبات الـ Webhook ] ===
app.post('*', async (req, res) => {
    // الرد الفوري لتلجرام أولاً لجعل البوت سريعاً جداً في المحادثة
    res.status(200).send('OK'); 

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    if (!text) return;

    // التأكد من أن المالك أو المسؤول هو من يرسل الأمر
    if (userId === OWNER_ID) {
        
        // أمر ترحيبي وفحص السرعة
        if (text === '/start') {
            await sendBotMessage(chatId, "⚡ أهلاً بك يا مالكي! البوت يعمل الآن بأعلى سرعة ومستقر تماماً.\n\n📥 أرسل لي رابط أي قناة لتحديدها كمقروءة فوراً.");
            return;
        }

        // تنفيذ أمر قراءة القنوات الأساسي والسريع
        if (text.includes("t.me/") || text.startsWith("@")) {
            await sendBotMessage(chatId, "⏳ جاري قراءة القناة...");
            const result = await markChannelAsRead(text);
            if (result.success) {
                await sendBotMessage(chatId, `✅ تم تحديد القناة [ ${result.title} ] كمقروءة بنجاح!`);
            } else {
                await sendBotMessage(chatId, `❌ فشلت المحاولة:\n${result.error}`);
            }
            return;
        }
    }
});

// دالة إرسال الرسائل الرسمية
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
