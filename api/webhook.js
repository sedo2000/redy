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

// === [ 💾 ذاكرة تخزين مؤقتة للبيانات الحية ] ===
let allowedAdmins = [OWNER_ID]; 
let isAway = false;             // حالة وضع الانشغال
let mutedUsers = [];            // قائمة المستخدمين المكتومين في الخاص
let lastReplied = {};           // حماية من السبام (لمنع تكرار الرد التلقائي في نفس الدقيقة)

// === [ ⏰ دالة تحديث الوقت، البايو، وحالة الاتصال ] ===
async function updateProfileAndStatus() {
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 1,
    });
    
    try {
        await client.connect();
        
        // 1. جعل الحساب يظهر "متصل الآن" (Always Online)
        await client.invoke(new Api.account.UpdateStatus({ offline: false }));
        
        // 2. جلب الوقت الحالي بتوقيت بغداد/العراق (GMT+3) وضبط الشكل
        const options = { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hour12: true };
        const timeString = new Date().toLocaleTimeString('en-US', options);
        
        // 3. تحديث البايو (Bio) تلقائياً بالوقت الحالي
        await client.invoke(new Api.account.UpdateProfile({
            about: `سديم | ⏰ ${timeString} | متصل دائماً ⚡`
        }));
        
        await client.disconnect();
    } catch (error) {
        console.error("Error in updateProfileAndStatus:", error);
        try { await client.disconnect(); } catch(e){}
    }
}

// === [ 📥 دالة معالجة الرد التلقائي في الخاص عند الانشغال أو النوم ] ===
async function handlePrivateReply(senderId) {
    // إذا كان المستخدم مكتوماً، لا تفعل شيئاً
    if (mutedUsers.includes(senderId)) return;

    // حماية من التكرار المستمر (Anti-Spam) - إذا تم الرد عليه خلال آخر دقيقة فلن يكرر الرد
    const now = Date.now();
    if (lastReplied[senderId] && (now - lastReplied[senderId] < 60000)) return;

    // فحص ساعات النوم التلقائية (مثلاً من 12 ليلاً إلى 7 صباحاً بتوقيت العراق)
    const options = { timeZone: 'Asia/Baghdad', hour: 'numeric', hour12: false };
    const currentHour = parseInt(new Date().toLocaleTimeString('en-US', options));
    const isSleepingTime = (currentHour >= 0 && currentHour < 7);

    // إذا كان وضع الانشغال مفعلاً أو كان وقت النوم الحالي
    if (isAway || isSleepingTime) {
        const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
            connectionRetries: 1,
        });

        try {
            await client.connect();
            
            let replyMessage = "👋 أهلاً بك، أنا غير متواجد حالياً (وضع الانشغال مفعّل).\nسأقوم بالرد عليك فور عودتي مباشرة! 🌹";
            if (isSleepingTime && !isAway) {
                replyMessage = "💤 أهلاً بك، أنا نائم حالياً والمساعد الذكي يتحدث نيابة عني.\nسأقوم بالرد عليك في الصباح فور استيقاظي! 😴";
            }

            await client.sendMessage(senderId, { message: replyMessage });
            lastReplied[senderId] = now; // حفظ وقت الرد لمنع السبام
            
            await client.disconnect();
        } catch (error) {
            console.error("Error in handlePrivateReply:", error);
            try { await client.disconnect(); } catch(e){}
        }
    }
}

// === [ 🌐 دالة قراءة القنوات الكلاسيكية ] ===
async function markChannelAsRead(channelUrl) {
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 1,
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

// === [ 🛸 استقبال طلبات الـ Webhook من تلجرام ] ===
app.post('*', async (req, res) => {
    res.status(200).send('OK'); // الرد الفوري لتلجرام

    const update = req.body;
    if (!update) return;

    // 1️⃣ تحديث تلقائي مخفي للاسم والبايو والاتصال مع كل حركة تحديث تصل للبوت
    updateProfileAndStatus().catch(e => console.error(e));

    // 2️⃣ معالجة الرسائل القادمة للبوت الرسمي
    if (update.message) {
        const chatId = Number(update.message.chat.id);
        const userId = Number(update.message.from.id);
        const text = update.message.text ? update.message.text.trim() : null;

        if (!text) return;

        // التحقق من صلاحية المالك (الأوامر الحساسة)
        if (userId === OWNER_ID) {
            
            // تفعيل وضع الانشغال
            if (text === '/away') {
                isAway = true;
                await sendBotMessage(chatId, "📴 تم **تفعيل** وضع الانشغال بنجاح. سيقوم حسابك بالرد تلقائياً على الرسائل الخاصة الآن.");
                return;
            }

            // تعطيل وضع الانشغال
            if (text === '/back') {
                isAway = false;
                await sendBotMessage(chatId, "🔛 تم **تعطيل** وضع الانشغال. الحساب عاد للوضع الطبيعي.");
                return;
            }

            // كتم عضو في الخاص
            if (text.startsWith('/mute')) {
                const target = parseInt(text.split(' ')[1]);
                if (!isNaN(target)) {
                    if (!mutedUsers.includes(target)) mutedUsers.push(target);
                    await sendBotMessage(chatId, `🔇 تم كتم العضو (${target}) بنجاح ولن يرد عليه الـ Userbot تلقائياً.`);
                } else {
                    await sendBotMessage(chatId, "⚠️ يرجى كتابة آيدي العضو بعد الأمر، مثال:\n`/mute 12345678`");
                }
                return;
            }

            // إلغاء كتم عضو في الخاص
            if (text.startsWith('/unmute')) {
                const target = parseInt(text.split(' ')[1]);
                if (!isNaN(target)) {
                    mutedUsers = mutedUsers.filter(id => id !== target);
                    await sendBotMessage(chatId, `🔊 تم إلغاء كتم العضو (${target}) بنجاح.`);
                } else {
                    await sendBotMessage(chatId, "⚠️ يرجى كتابة آيدي العضو بعد الأمر، مثال:\n`/unmute 12345678`");
                }
                return;
            }

            // تحديث يدوي فوراً للملف الشخصي للاختبار
            if (text === '/setstatus') {
                await sendBotMessage(chatId, "⏳ جاري تحديث الوقت في البايو وتنشيط وضع الاتصال الآن...");
                await updateProfileAndStatus();
                await sendBotMessage(chatId, "✅ تم التحديث بنجاح الحساب يظهر أونلاين والبايو يحتوي الوقت الحالي بتوقيت بغداد.");
                return;
            }

            // إضافة مسؤول عادي لقراءة القنوات
            if (text.startsWith('/addadmin')) {
                const targetId = parseInt(text.split(' ')[1]);
                if (!isNaN(targetId) && !allowedAdmins.includes(targetId)) {
                    allowedAdmins.push(targetId);
                    await sendBotMessage(chatId, `✅ تم رفع المسؤول (${targetId}) بنجاح.`);
                }
                return;
            }
        }

        // تنفيذ أمر قراءة القنوات (للمسؤولين والمالك)
        if (allowedAdmins.includes(userId)) {
            if (text.includes("t.me/") || text.startsWith("@")) {
                await sendBotMessage(chatId, "⏳ جاري الاتصال بحسابك وتحديد القناة كمقروءة...");
                const result = await markChannelAsRead(text);
                if (result.success) {
                    await sendBotMessage(chatId, `✅ تم تحديد القناة [ ${result.title} ] كمقروءة بنجاح!`);
                } else {
                    await sendBotMessage(chatId, `❌ حدث خطأ أثناء المحاولة:\n${result.error}`);
                }
                return;
            }
        }
    }

    // 3️⃣ تتبع التحديثات الخاصة بالـ Userbot (إذا أرسل لك شخص رسالة في الخاص لتشغيل الرد التلقائي)
    if (update.my_chat_member || (update.message && update.message.chat.type === "private")) {
        const senderId = update.message ? Number(update.message.from.id) : null;
        // التأكد من أن الرسالة في الخاص وليست قادمة منك أنت شخصياً أو من بوت آخر
        if (senderId && senderId !== OWNER_ID && senderId !== Number(BOT_TOKEN.split(':')[0])) {
            handlePrivateReply(senderId).catch(e => console.error(e));
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
            body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" })
        });
    } catch (e) {
        console.error("Error sending message:", e);
    }
}

module.exports = app;
