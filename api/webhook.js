/**
 * 🕵️‍♂️ TELEGRAM ADVANCED CHAT INSPECTOR & METADATA ENGINE
 * 🚀 PLATFORM: VERCEL SERVERLESS (NODE.JS)
 * 🛠️ ARCHITECTURE: PRODUCTION-GRADE MULTI-LAYER ARCHITECTURE
 * 📐 LINE COUNT: +600 LINES OF ROBUST, CLEAN, AND SECURE CODE
 */

const express = require('express');
const https = require('https');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

// ==========================================
// 🛠️ 1. INITIALIZATION & CONFIGURATION LAYER
// ==========================================

const app = express();
app.use(express.json());

// جلب الإعدادات البيئية من خوادم فيرسل مع معالجة النصوص والفراغات
const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";
const API_ID = process.env.API_ID ? parseInt(process.env.API_ID.trim()) : 0;
const API_HASH = process.env.API_HASH ? process.env.API_HASH.trim() : "";
const STRING_SESSION = process.env.STRING_SESSION ? process.env.STRING_SESSION.trim() : "";
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID.trim()) : 0;

// ذاكرة داخلية مؤقتة لإدارة الكيانات ومنع قفل الـ Flood Wait
const GLOBAL_CACHE = {
    entities: new Map(),
    logs: [],
    requestCount: 0
};

// ==========================================
// 📊 2. HELPER FUNCTIONS & LOGGING UTILITIES
// ==========================================

/**
 * دالة مخصصة لإضافة السجلات والتشخيص البرمجي الداخلي
 */
function addToLog(status, message) {
    const timestamp = new Date().toISOString();
    GLOBAL_CACHE.logs.push(`[${timestamp}] [${status}] ${message}`);
    if (GLOBAL_CACHE.logs.length > 100) GLOBAL_CACHE.logs.shift();
    console.log(`[${status}] ${message}`);
}

/**
 * تنظيف المدخلات النصية والمعرفات من الرموز العشوائية والأقواس
 */
function sanitizeInput(input) {
    if (!input) return "";
    addToLog("DEBUG", `Cleaning input: ${input}`);
    return input.trim()
                .replace(/[\[\]]/g, '')
                .replace(/[\(\)]/g, '')
                .replace(/['"]/g, '')
                .replace(/`/g, '');
}

/**
 * دالة حسابية متقدمة لتقدير عمر الحساب بالاعتماد على النطاق الرقمي للـ ID في تلجرام
 */
function calculateAccountAge(idString) {
    addToLog("DEBUG", `Calculating approximate creation date for ID: ${idString}`);
    const id = Number(idString);
    if (isNaN(id)) return { period: "غير معروف", year: "N/A", status: "❌ آيدي غير صالح" };

    if (id < 50000000) return { period: "قديم جداً (بدايات تلجرام)", year: "2013 - 2014", status: "💎 عتيق" };
    if (id < 150000000) return { period: "قديم (الجيل الأول)", year: "2014 - 2015", status: "🏅 مخضرم" };
    if (id < 300000000) return { period: "متوسط العمر (عصر الطفرة)", year: "2015 - 2016", status: "⭐ مستقر" };
    if (id < 500000000) return { period: "متوسط العمر (الجيل الثاني)", year: "2016 - 2017", status: "⭐ مستقر" };
    if (id < 800000000) return { period: "حديث نسبياً", year: "2018 - 2019", status: "⚡ نشط" };
    if (id < 1300000000) return { period: "حديث (جيل كورونا)", year: "2020 - 2021", status: "⚡ نشط" };
    if (id < 2000000000) return { period: "جديد", year: "2021 - 2023", status: "🆕 جديد" };
    return { period: "جديد جداً (حديث الإنشاء)", year: "2024 - 2026", status: "👶 طازج" };
}

// ==========================================
// 🔌 3. NETWORK & TELEGRAM HTTP RAW LAYER
// ==========================================

/**
 * إرسال الرسائل النصية المنسقة عبر بروتوكول HTTPS الخام لضمان عدم السقوط
 */
function sendBotMessageRaw(chatId, textMessage) {
    return new Promise((resolve, reject) => {
        addToLog("NETWORK", `Sending message to Chat ID: ${chatId}`);
        const postData = JSON.stringify({
            chat_id: chatId,
            text: textMessage,
            parse_mode: "Markdown"
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            }
        };

        const req = https.request(options, (res) => {
            let chunkData = '';
            res.on('data', (chunk) => chunkData += chunk);
            res.on('end', () => resolve(chunkData));
        });

        req.on('error', (err) => {
            addToLog("ERROR", `Failed to send message: ${err.message}`);
            reject(err);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * محرك الفحص السريع عبر البوت للتأمين قبل تشغيل الـ Userbot
 */
function fetchChatViaBot(target) {
    return new Promise((resolve) => {
        addToLog("NETWORK", `Executing internal getChat for target: ${target}`);
        const postData = JSON.stringify({ chat_id: target });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/getChat`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            },
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (e) {
                    resolve({ ok: false, description: "JSON Parsing Exception" });
                }
            });
        });

        req.on('error', () => resolve({ ok: false, description: "Network Connection Timeout" }));
        req.write(postData);
        req.end();
    });
}

// ==========================================
// 🛡️ 4. CORE ENGINE & DEEP INSPECTOR LAYER
// ==========================================

/**
 * المعالج العميق لاستخراج البيانات الفنية من خوادم تلجرام عبر الحساب والبوت معاً
 */
async function processDeepInspection(chatId, targetInput) {
    addToLog("ENGINE", `Initiating Multi-Layer Core Inspection for: ${targetInput}`);
    
    // تفعيل الجلسة مع إعدادات متقدمة للحماية ومقاومة التجميد
    const client = new TelegramClient(new StringSession(STRING_SESSION), API_ID, API_HASH, {
        connectionRetries: 1,
        timeout: 10000,
        useWSServer: false,
        autoReconnect: false
    });

    try {
        // خطوة 1: المحاولة عبر البوت السريع كخط دفاع أول لحماية حسابك من الحظر
        const botCheck = await fetchChatViaBot(targetInput);
        let botMetadata = null;
        if (botCheck.ok) {
            addToLog("ENGINE", "First layer hit successfully via HTTP Bot API.");
            botMetadata = botCheck.result;
        }

        // خطوة 2: تشغيل الـ Userbot للغوص في البيانات العميقة والـ Restrictions
        addToLog("ENGINE", "Connecting Userbot client to Telegram Datacenters...");
        await client.connect();
        addToLog("ENGINE", "Userbot handshake complete.");

        let entity = null;
        const isNumeric = /^-?\d+$/.test(targetInput);

        if (isNumeric) {
            const bigIntId = BigInt(targetInput);
            addToLog("ENGINE", `Resolving Entity via BigInt Account ID: ${bigIntId}`);
            entity = await client.getEntity(bigIntId).catch(async () => {
                return await client.getInputEntity(bigIntId).catch(() => null);
            });
        } else {
            const formattedTarget = targetInput.startsWith('@') ? targetInput : `@${targetInput}`;
            addToLog("ENGINE", `Resolving Entity via Username Handle: ${formattedTarget}`);
            entity = await client.getEntity(formattedTarget).catch(() => null);
        }

        // خطوة 3: تحليل البيانات وصياغة التقرير في حال العثور على الكيان
        if (entity) {
            addToLog("ENGINE", `Entity matched successfully. ClassName: ${entity.className}`);
            
            // تصنيف نوع الحساب البرمي
            let entityType = "👤 مستخدم طبيعي (User Account)";
            let isChannelOrGroup = false;

            if (entity.className === 'Channel') {
                isChannelOrGroup = true;
                entityType = entity.broadcast ? "📢 قناة رسمية بثق ثنائي (Broadcast Channel)" : "👥 مجموعة خارقة (Supergroup)";
            } else if (entity.className === 'Chat') {
                isChannelOrGroup = true;
                entityType = "👥 مجموعة عادية كلاسيكية (Basic Group)";
            }

            // استخراج الهويات والثوابت الرقمية
            const finalId = entity.id ? entity.id.toString() : targetInput;
            const firstName = entity.firstName || "";
            const lastName = entity.lastName || "";
            const accountTitle = entity.title || `${firstName} ${lastName}`.trim() || "مجهول الاسم";
            const currentUsername = entity.username ? `@${entity.username}` : "لا يوجد يوزر حالياً";
            
            // حساب التقدير الزمني
            const ageData = calculateAccountAge(finalId);

            // استخراج الأمان والتوثيق والقيود المخفية
            const systemVerified = entity.verified ? "⭐ نعم (حساب موثق رسمياً)" : "❌ غير موثق";
            const scamMark = entity.scam ? "🚨 نعم (موسوم كـ محتال!)" : "✅ نظيف وموثوق";
            const fakeMark = entity.fake ? "🚨 نعم (موسوم كـ مزيف!)" : "✅ نظيف وموثوق";
            
            // تفكيك وفحص القيود الدولية لكل منصة بشكل معزول
            let globalRestrictions = "🛡️ لا توجد أي قيود دولية أو بلاغات على هذا الحساب.";
            if (entity.restrictionReason && entity.restrictionReason.length > 0) {
                globalRestrictions = entity.restrictionReason.map((r, i) => {
                    return `   [${i + 1}] المنصة: \`${r.platform}\` | السبب: _${r.reason}_`;
                }).join('\n');
            }

            // دمج البايو والوصف من طبقة البوت إن وجد
            const bioData = botMetadata ? (botMetadata.bio || botMetadata.description || "لا يوجد بايو متاح") : "تعذر جلب البايو (الحساب مقفل)";

            // صياغة التقرير التقني الفخم والمفصل سطراً بسطر
            let technicalReport = `📊 **التقرير الفني والعميق للمُعرّف والكيان (Metadata Report)**\n`;
            technicalReport += `========================================\n\n`;
            technicalReport += `📌 **[أولاً: البيانات التعريفية الأساسية]**\n`;
            technicalReport += `• **الاسم الحالي بالسيرفر:** \`${accountTitle}\`\n`;
            technicalReport += `• **الآيدي الرقمي الثابت:** \`${finalId}\`\n`;
            technicalReport += `• **المعرف الحالي (Username):** ${currentUsername}\n`;
            technicalReport += `• **نوع الكيان البرمي:** \`${entityType}\`\n`;
            technicalReport += `• **الوصف / السيرة الذاتية:** _${bioData}_\n\n`;

            technicalReport += `⏳ **[ثانياً: التحليل الزمني وعمر الحساب]**\n`;
            technicalReport += `• **فترة الإنشاء التقريبية:** \`${ageData.period}\`\n`;
            technicalReport += `• **تاريخ التسجيل المتوقع:** \`${ageData.year}\`\n`;
            technicalReport += `• **حالة الحساب الزمنية:** ${ageData.status}\n\n`;

            technicalReport += `🚨 **[ثالثاً: مصفوفة الأمان وكاشف البلاغات]**\n`;
            technicalReport += `• **نظام التوثيق النجمي:** ${systemVerified}\n`;
            technicalReport += `• **مؤشر الاحتيال (Scam Indicator):** ${scamMark}\n`;
            technicalReport += `• **مؤشر التزييف (Fake Indicator):** ${fakeMark}\n`;
            technicalReport += `• **سجل القيود والحظر الإداري:**\n${globalRestrictions}\n\n`;
            
            technicalReport += `========================================\n`;
            technicalReport += `💡 _ملاحظة: الآيدي الثابت لا يتغير مطلقاً؛ يمكنك الاحتفاظ به لمراقبة تغييرات الاسم واليوزر لهذا الحساب مستقبلاً._`;

            await sendBotMessageRaw(chatId, technicalReport);
        } else {
            // معالجة الفشل في حال عدم تطابق الكيان مع السيرفر
            addToLog("WARNING", `No entity found for target: ${targetInput}`);
            let failMessage = `❌ **فشل الفحص العميق للمعرف:** \`[ ${targetInput} ]\`\n\n`;
            failMessage += `**السبب المحتمل:**\n`;
            failMessage += `1. الآيدي أو المعرف غير صحيح أو تم حذفه بالكامل.\n`;
            failMessage += `2. الحساب شخصي تماماً ولم يقم بتفعيل أي قنوات أو التفاعل مع بوتات سابقة.\n`;
            failMessage += `3. الحساب قام بتفعيل أقصى درجات الخصوصية للأمان والمنع الشخصي.`;
            await sendBotMessageRaw(chatId, failMessage);
        }

    } catch (coreError) {
        addToLog("CRITICAL", `Exception caught in Core Inspection Layer: ${coreError.message}`);
        let errorMessage = `❌ **فشل في إتمام عملية الفحص التقني العميق**\n\n`;
        errorMessage += `• **تفاصيل الأزمة:** \`${coreError.message}\`\n`;
        errorMessage += `• **طبقة الخطأ:** \`Core Engine Runtime\`\n\n`;
        errorMessage += `⚙️ _يرجى التحقق من سلامة وثبات السيزن آيدي (String Session) الخاص بك بداخل بيئة عمل فيرسل._`;
        await sendBotMessageRaw(chatId, errorMessage);
    } finally {
        // حماية الذاكرة وإغلاق الجلسة فوراً لمنع التجميد والـ Timeout
        addToLog("ENGINE", "Terminating Userbot connection session safely.");
        try { await client.disconnect(); } catch (e) { addToLog("DEBUG", "Client already disconnected or dead."); }
    }
}

// ==========================================
// 🛸 5. ROUTING & WEBHOOK CONTROLLER LAYER
// ==========================================

/**
 * نقطة استقبال طلبات الـ Webhook الرئيسية من خوادم تلجرام
 */
app.post('*', async (req, res) => {
    GLOBAL_CACHE.requestCount++;
    addToLog("WEBHOOK", `Received inbound request #${GLOBAL_CACHE.requestCount}`);

    // الرد الفوري المباشر بـ 200 OK لتلجرام؛ خط دفاع حرج لمنع التكرار والـ Timeout نهائياً
    res.status(200).send('OK');

    try {
        const update = req.body;
        if (!update || !update.message) {
            addToLog("WEBHOOK", "Request body empty or doesn't contain a valid message update.");
            return;
        }

        const chatId = Number(update.message.chat.id);
        const userId = Number(update.message.from.id);
        const text = update.message.text ? update.message.text.trim() : null;

        // صمام الأمان: منع أي مستخدم آخر من استهلاك موارد البوت عدا المالك
        if (userId !== OWNER_ID) {
            addToLog("SECURITY", `Unauthorized access attempt blocked from User ID: ${userId}`);
            return;
        }

        // معالجة أمر التهيئة وتشغيل النظام (.start)
        if (text === '.start') {
            addToLog("COMMAND", "Executing system startup message command [.start]");
            let startMessage = `🕵️‍♂️ **مرحباً بك في نظام الفحص الفني والمفتش العميق (Chat Inspector Pro)**\n`;
            startMessage += `----------------------------------------\n\n`;
            startMessage += `النظام مجهز بالكامل بهندسة برمجية متقدمة ومحمي ضد تكرار الرسائل والتعليق.\n\n`;
            startMessage += `📊 **طريقة الفحص والاستخدام:**\n`;
            startMessage += `• **عبر اليوزر (Handle):** \`.inspect
