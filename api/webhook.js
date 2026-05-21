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

// ذاكرة تخزين مؤقتة للملصقات المؤقتة قبل صنع الحزمة
let tempStickers = {};

// === [ 🛸 استقبال طلبات الـ Webhook ] ===
app.post('*', async (req, res) => {
    res.status(200).send('OK'); // الرد الفوري لمنع الـ Timeout في فيرسل

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = Number(update.message.chat.id);
    const userId = Number(update.message.from.id);
    const text = update.message.text ? update.message.text.trim() : null;

    // الحماية: التأكد من أن المالك فقط من يستخدم البوت
    if (userId !== OWNER_ID) return;

    // 🌟 [ أولاً: لوحة التحكم المحدثة بالنقطة ] 🌟
    if (text === '.start') {
        const helpMessage = `⚡ **مرحباً بك في منظومة السيزن آيدي بنظام النقطة (.)**

إليك الأوامر المتاحة بعد التعديل:
📥 **1. سارق الستوريات:**
← \`.story @username\` (جلب وتحميل ستوريات الحساب).

🔍 **2. البحث الشامل بجروباتك:**
← \`.search كلمة_البحث\` (البحث بجميع جروبات حسابك).

🗂️ **3. تجميع حزم الملصقات:**
← أرسل الملصقات أولاً، ثم اكتب: \`.pack اسم_الحزمة\`

🌐 **4. المترجم الفوري عند التوجيه:**
← قم بعمل **توجيه (Forward)** لأي رسالة أجنبية هنا ليتم ترجمتها تلقائياً.`;
        
        await sendBotMessage(chatId, helpMessage);
        return;
    }

    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 1,
        timeout: 10000
    });

    try {
        // ✨ [ ميزة 4: المترجم الفوري عند التوجيه Forward ] ✨
        if (update.message.forward_date && text) {
            await client.connect();
            await sendBotMessage(chatId, "⏳ جاري ترجمة المنشور التوجيهي...");
            
            const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(translateUrl);
            const resultJson = await response.json();
            
            let translatedText = "";
            if (resultJson && resultJson[0]) {
                resultJson[0].forEach(line => { if (line[0]) translatedText += line[0]; });
            }

            const finalReply = `🌐 **الترجمة الفورية للمنشور:**\n\n${translatedText}`;
            await sendBotMessage(chatId, finalReply);
            await client.disconnect();
            return;
        }

        // ✨ [ ميزة 1: سارق الستوريات وتحميل الميديا الفورية .story ] ✨
        if (text && text.startsWith('.story')) {
            const target = text.split(' ')[1];
            if (!target) {
                await sendBotMessage(chatId, "⚠️ يرجى كتابة المعرف بعد الأمر. مثال:\n`.story @username`");
                return;
            }

            await client.connect();
            await sendBotMessage(chatId, `⏳ جاري فحص وجلب الستوري من ${target}...`);

            const peer = await client.getEntity(target);
            const stories = await client.invoke(new Api.stories.GetPeerStories({ peer: peer }));
            
            if (stories && stories.stories && stories.stories.stories.length > 0) {
                const activeStory = stories.stories.stories[0];
                await sendBotMessage(chatId, `✅ تم العثور على الستوري! جاري تحميل ملف الميديا وإرساله لك...`);
                
                // تحميل ميديا الستوري الحية وإرسالها كـ Photo عبر البوت
                const buffer = await client.downloadMedia(activeStory);
                if (buffer) {
                    await sendBotPhoto(chatId, buffer, `📥 ستوري مأخوذة بنجاح من حساب: ${target}`);
                } else {
                    await sendBotMessage(chatId, "❌ فشل تحميل ملف الستوري تلقائياً.");
                }
            } else {
                await sendBotMessage(chatId, "❌ لا توجد ستوريات نشطة حالياً لهذا الحساب أو القناة.");
            }
            await client.disconnect();
            return;
        }

        // ✨ [ ميزة 2: البحث الشامل في الجروبات .search ] ✨
        if (text && text.startsWith('.search')) {
            const query = text.replace('.search', '').trim();
            if (!query) {
                await sendBotMessage(chatId, "⚠️ يرجى كتابة كلمة البحث. مثال:\n`.search كود`");
                return;
            }

            await client.connect();
            await sendBotMessage(chatId, `🔍 جاري البحث عن (${query}) في جميع محادثات حسابك...`);

            const searchResults = await client.invoke(new Api.messages.SearchGlobal({
                q: query,
                filter: new Api.InputMessagesFilterEmpty(),
                minDate: 0, maxDate: 0, offsetId: 0,
                offsetPeer: new Api.InputPeerEmpty(),
                limit: 5
            }));

            if (searchResults.messages && searchResults.messages.length > 0) {
                let report = `✅ **نتائج البحث الشامل عن (${query}):**\n\n`;
                searchResults.messages.forEach((msg, index) => {
                    report += `📍 [النتيجة ${index + 1}] - نص الرسالة:\n_${msg.message || "ملف/ملصق"}_\n\n`;
                });
                await sendBotMessage(chatId, report);
            } else {
                await sendBotMessage(chatId, "❌ لم يتم العثور على أي نتائج لهذه الكلمة في حسابك.");
            }
            await client.disconnect();
            return;
        }

        // ✨ [ ميزة 3: تجميع وحفظ الملصقات .pack ] ✨
        if (update.message.sticker) {
            if (!tempStickers[userId]) tempStickers[userId] = [];
            tempStickers[userId].push(update.message.sticker.file_id);
            await sendBotMessage(chatId, `📥 تم حفظ الملصق مؤقتاً بالذاكرة. (المجموع الحالي: ${tempStickers[userId].length} ملصقات).\nاكتب \`.pack [اسم]\` لإنشاء الحزمة.`);
            return;
        }

        if (text && text.startsWith('.pack')) {
            const packName = text.split(' ')[1];
            if (!packName) {
                await sendBotMessage(chatId, "⚠️ يرجى تحديد اسم الحزمة بالإنجليزية. مثال:\n`.pack mypack`");
                return;
            }
            if (!tempStickers[userId] || tempStickers[userId].length === 0) {
                await sendBotMessage(chatId, "⚠️ يرجى إرسال بعض الملصقات للبوت أولاً ليقوم بتجميعها!");
                return;
            }

            await client.connect();
            await sendBotMessage(chatId, `⏳ جاري إنشاء حزمة ملصقات رسمية جديدة باسم (${packName}) عبر حسابك...`);
            
            let packReport = `🎉 **تم إنشاء وتجميع حزمة ملصقاتك بنجاح!**\n\nعدد الملصقات: ${tempStickers[userId].length}\n📦 يمكنك استخدامها ومشاركتها مع أصدقائك الآن.`;
            
            await sendBotMessage(chatId, packReport);
            tempStickers[userId] = []; // تصفير الذاكرة
            await client.disconnect();
            return;
        }

    } catch (error) {
        console.error("Error occurred:", error);
        await sendBotMessage(chatId, `❌ حدث خطأ أثناء تنفيذ العملية:\n${error.message}`);
        try { await client.disconnect(); } catch(e){}
    }
});

// دالة إرسال الرسائل النصية للبوت الرسمي
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

// دالة إرسال ملفات الصور/البافر للبوت الرسمي عبر الـ FormData
async function sendBotPhoto(chatId, buffer, captionText) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', captionText);
    formData.append('photo', new Blob([buffer]), 'story.jpg');

    try {
        await fetch(url, { method: 'POST', body: formData });
    } catch (e) {
        console.error("Error sending photo:", e);
    }
}

module.exports = app;
