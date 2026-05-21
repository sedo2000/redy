const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات مع تنظيفها تماماً من أي مسافات زائدة ] ===
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";

// تحويل OWNER_ID إلى رقم بشكل صارم وتنظيفه
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

// مصفوفة المسؤولين المصرح لهم
let allowedAdmins = [OWNER_ID]; 
let currentSession = STRING_SESSION;

let loginClients = {}; 
let loginStates = {};  

// دالة تشغيل الـ Userbot لقراءة القناة
async function markChannelAsRead(channelUrl) {
    if (!currentSession) {
        return { success: false, error: "لم يتم استخراج جلسة السيزن بعد. يرجى إرسال رقم الهاتف أولاً." };
    }

    const client = new TelegramClient(new StringSession(currentSession), API_ID, API_HASH, {
        connectionRetries: 2,
    });
    
    try {
        await client.connect();
        const channelEntity = await client.getEntity(channelUrl);
        
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
    // رد فوري لتلجرام
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

    // --- نظام استخراج جلسة السيزن (للمالك فقط) ---
    if (userId === OWNER_ID) {
        // الخطوة 1: استقبال رقم الهاتف
        if (text.startsWith('+')) {
            await sendBotMessage(chatId, "⏳ جاري بدء جلسة تسجيل الدخول وإرسال الكود من تلجرام...");
            
            const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
                connectionRetries: 3,
            });

            try {
                await client.connect();
                const sendCodeResult = await client.sendCode(
                    { apiId: API_ID, apiHash: API_HASH },
                    text
                );

                loginClients[userId] = client;
                loginStates[userId] = {
                    phone: text,
                    phoneCodeHash: sendCodeResult.phoneCodeHash,
                    step: 'WAITING_CODE'
                };

                await sendBotMessage(chatId, "📩 تم إرسال الكود إلى حسابك في تلجرام.\nقم بإرسال الكود الآن للبوت مباشرة (مثال: 12345).");
            } catch (err) {
                await sendBotMessage(chatId, `❌ فشل إرسال الكود:\n${err.message}`);
            }
            return;
        }

        // الخطوة 2: استقبال كود التحقق
        if (loginStates[userId] && loginStates[userId].step === 'WAITING_CODE') {
            const state = loginStates[userId];
            const client = loginClients[userId];

            try {
                await client.signIn({
                    phoneNumber: state.phone,
                    phoneCodeHash: state.phoneCodeHash,
                    phoneCode: text,
                    onError: async (err) => {
                        if (err.message.includes("SESSION_PASSWORD_NEEDED")) {
                            state.step = 'WAITING_PASSWORD';
                            await sendBotMessage(chatId, "🔐 حسابك محمي بـ (التحقق بخطوتين).\nالرجاء إرسال كلمة سر الحساب الآن.");
                        } else {
                            throw err;
                        }
                    }
                });

                if (state.step === 'WAITING_CODE') {
                    currentSession = client.session.save();
                    await sendBotMessage(chatId, `✅ تم تسجيل الدخول بنجاح!\n\n🔑 **جلسة السيزن الخاصة بك:**\n\`${currentSession}\`\n\nقم بنسخها وحفظها في إعدادات فيرسل باسم \`STRING_SESSION\`.`);
                    delete loginClients[userId];
                    delete loginStates[userId];
                }
            } catch (err) {
                if (state.step === 'WAITING_CODE') {
                    await sendBotMessage(chatId, `❌ خطأ في الكود: ${err.message}\nيرجى إعادة إرسال الكود الصحيح.`);
                }
            }
            return;
        }

        // الخطوة 3: استقبال كلمة المرور
        if (loginStates[userId] && loginStates[userId].step === 'WAITING_PASSWORD') {
            const client = loginClients[userId];

            try {
                await client.signIn({ password: text });
                currentSession = client.session.save();
                await sendBotMessage(chatId, `✅ تم التحقق بنجاح!\n\n🔑 **جلسة السيزن الخاصة بك:**\n\`${currentSession}\`\n\nقم بنسخها وحفظها في إعدادات فيرسل باسم \`STRING_SESSION\`.`);
                delete loginClients[userId];
                delete loginStates[userId];
            } catch (err) {
                await sendBotMessage(chatId, `❌ كلمة السر خاطئة: ${err.message}\nيرجى إرسال كلمة السر الصحيحة.`);
            }
            return;
        }
    }

    // --- التحقق من الصلاحية للأعضاء العاديين أو القنوات ---
    if (!allowedAdmins.includes(userId)) {
        return; // تجاهل تماماً أي شخص غريب لحماية البوت
    }

    // استقبال روابط القنوات
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
            body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" })
        });
    } catch (e) {
        console.error("Error sending message:", e);
    }
}

module.exports = app;
