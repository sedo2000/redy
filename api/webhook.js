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

// دالة قراءة القنوات
async function markChannelAsRead(channelUrl) {
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 1,
        timeout: 10000
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

// دالة الرد التلقائي بروابط التحميل في الخاص عبر الـ Userbot
async function sendDownloadLinks(senderId, videoUrl) {
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 1,
        timeout: 10000
    });
    try {
        await client.connect();
        
        const encodedUrl = encodeURIComponent(videoUrl);
        const mp3Link = `https://www.y2mate.com/search/${encodedUrl}`;
        const videoLink = `https://savefrom.net/?url=${encodedUrl}`;

        const responseMessage = `👋 أهلاً بك يا صديقي! لقد استلمت رابط الفيديو الخاص بك بنجاح.

🎧 **لتحميل الفيديو كملف صوتي MP3:**
◀️ [اضغط هنا للتحويل والتحميل فوراً](${mp3Link})

🎬 **لتحميل الفيديو بجودة عالية:**
◀️ [اضغط هنا للتحميل المباشر](${videoLink})

✨ _تمت المعالجة تلقائياً بواسطة مساعد سديم الذكي_`;

        await client.sendMessage(senderId, { message: responseMessage, parseMode: "markdown" });
        await client.disconnect();
    } catch (error) {
        console.error("Error sending download links:", error);
        try { await client.disconnect(); } catch(e){}
    }
}

// === [ 🛸 استقبال طلبات الـ Webhook ] ===
app.post('*', async (req, res) => {
    res.status(200).send('OK'); // الرد الفوري لتلجرام للسرعة القصوى

    const update = req.body;
    if (!update) return;

    // 1️⃣ فحص الخاص: إذا وصل رابط من صديق
    if (update.message && update.message.chat && update.message.chat.type === "private") {
        const senderId = Number(update.message.from.id);
        const text = update.message.text ? update.message.text.trim() : null;

        // التأكد من أن المرسل ليس أنت وليس البوت نفسه
        if (text && senderId !== OWNER_ID && senderId !== Number(BOT_TOKEN.split(':')[0])) {
            const lowerText = text.toLowerCase();
            // دعم جميع صيغ روابط يوتيوب (بما فيها المختصرة والـ Shorts) وتيك توك وإنستغرام
            if (lowerText.includes("youtube.com") || lowerText.includes("youtu.be") || lowerText.includes("tiktok.com") || lowerText.includes("instagram.com")) {
                sendDownloadLinks(senderId, text).catch(e => console.error(e));
                return;
            }
        }
    }

    // 2️⃣ أوامر المالك في البوت لقراءة القنوات
    if (update.message) {
        const chatId = Number(update.message.chat.id);
        const userId = Number(update.message.from.id);
        const text = update.message.text ? update.message.text.trim() : null;

        if (!text || userId !== OWNER_ID) return;

        if (text === '/start') {
            await sendBotMessage(chatId, "⚡ البوت مستقر وسريع ويعمل الآن!\n📥 أرسل لي رابط قناة لقراءتها، وحسابك في الخاص سيرد تلقائياً بروابط تحميل الفيديوهات لأصدقائك.");
            return;
        }

        if (text.includes("t.me/") || text.startsWith("@")) {
            await sendBotMessage(chatId, "⏳ jاري قراءة القناة...");
            const result = await markChannelAsRead(text);
            if (result.success) {
                await sendBotMessage(chatId, `✅ تم تحديد القناة [ ${result.title} ] كمقروءة بنجاح!`);
            } else {
                await sendBotMessage(chatId, `❌ فشلت المحاولة:\n${result.error}`);
            }
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
