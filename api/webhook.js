const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(express.json());

// === [ ⚙️ جلب الإعدادات من بيئة فيرسل ] ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_ID = parseInt(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const OWNER_ID = parseInt(process.env.OWNER_ID);

// متغيرات ديناميكية يتم حفظها في الذاكرة المؤقتة أثناء تشغيل السيرفر
let allowedAdmins = [OWNER_ID]; 
let currentSession = process.env.STRING_SESSION || ""; // تبدأ بالجلسة المخزنة في فيرسل إن وجدت

// كائنات لإدارة عملية تسجيل الدخول المؤقتة
let loginClients = {}; // لحفظ كائن التلجرام لكل مستخدم أثناء تسجيل الدخول
let loginStates = {};  // لحفظ الحالة الحالية للمستخدم (phone, code, password)

// التحقق من الإعدادات الأساسية
if (!BOT_TOKEN || !API_ID || !API_HASH || !OWNER_ID) {
    console.error("❌ خطأ: بعض المتغيرات البيئية (Environment Variables) مفقودة في فيرسل!");
}

// === [ 🤖 دالة تشغيل الـ Userbot لقراءة القناة ] ===
async function markChannelAsRead(channelUrl) {
    if (!currentSession) {
        return { success: false, error: "لم يتم استخراج جلسة السيزن (String Session) بعد. يرجى تسجيل الدخول أولاً عن طريق إرسال رقم الهاتف." };
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

// === [ 🌐 استقبال طلبات الـ Webhook من تلجرام ] ===
app.post('*', async (req, res) => {
    res.status(200).send('OK');

    const update = req.body;
    if (!update || !update.message) return;

    const chatId = update.message.chat.id;
    const userId = update.message.from.id;
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

    // --- نظام استخراج جلسة السيزن (للمالك فقط لحماية الحساب) ---
    if (userId === OWNER_ID) {
        // الخطوة 1: استقبال رقم الهاتف
        if (text.startsWith('+')) {
            await sendBotMessage(chatId, "⏳ جاري بدء جلسة تسجيل الدخول وإرسال الكود من تلجرام...");
            
            const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
                connectionRetries: 3,
            });

            try {
                await client.connect();
                // طلب إرسال كود التحقق من تلجرام
                const sendCodeResult = await client.sendCode(
                    { apiId: API_ID, apiHash: API_HASH },
                    text
                );

                // حفظ البيانات في الذاكرة المؤقتة للانتقال للخطوة التالية
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
                // محاولة تسجيل الدخول بالكود
                await client.signIn({
                    phoneNumber: state.phone,
                    phoneCodeHash: state.phoneCodeHash,
                    phoneCode: text,
                    onError: async (err) => {
                        // إذا كان الحساب محمي بالتحقق بخطوتين
                        if (err.message.includes("SESSION_PASSWORD_NEEDED")) {
                            state.step = 'WAITING_PASSWORD';
                            await sendBotMessage(chatId, "🔐 حسابك محمي بـ (التحقق بخطوتين).\nالرجاء إرسال كلمة سر الحساب الآن.");
                        } else {
                            throw err;
                        }
                    }
                });

                // إذا نجح تسجيل الدخول مباشرة بدون كلمة سر
                if (state.step === 'WAITING_CODE') {
                    currentSession = client.session.save();
                    await sendBotMessage(chatId, `✅ تم تسجيل الدخول بنجاح!\n\n🔑 **جلسة السيزن الخاصة بك (String Session):**\n\`${currentSession}\`\n\nقم بنسخها وحفظها في إعدادات فيرسل باسم \`STRING_SESSION\` لضمان عدم ضياعها عند إعادة تشغيل السيرفر.`);
                    
                    // تنظيف الذاكرة
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

        // الخطوة 3: استقبال كلمة مرور التحقق بخطوتين (إن وجدت)
        if (loginStates[userId] && loginStates[userId].step === 'WAITING_PASSWORD') {
            const client = loginClients[userId];

            try {
                await client.signIn({
                    password: text
                });

                currentSession = client.session.save();
                await sendBotMessage(chatId, `✅ تم التحقق وتسجيل الدخول بنجاح!\n\n🔑 **جلسة السيزن الخاصة بك (String Session):**\n\`${currentSession}\`\n\nقم بنسخها وحفظها في إعدادات فيرسل باسم \`STRING_SESSION\` لضمان عدم ضياعها عند إعادة تشغيل السيرفر.`);
                
                delete loginClients[userId];
                delete loginStates[userId];
            } catch (err) {
                await sendBotMessage(chatId, `❌ كلمة السر خاطئة: ${err.message}\nيرجى إرسال كلمة السر الصحيحة.`);
            }
            return;
        }
    }

    // --- التحقق من الصلاحية للأعضاء العاديين ---
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
            body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: "Markdown" })
        });
    } catch (e) {
        console.error("Error sending message:", e);
    }
}

module.exports = app;
