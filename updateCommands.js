const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const fs = require('fs');

// دعم قراءة التوكن والـ ClientId محلياً أو من بيئة الاستضافة
let token, clientId;
if (fs.existsSync('./config.json')) {
    const config = require('./config.json');
    token = config.token;
    clientId = config.clientId;
} else {
    token = process.env.TOKEN;
    clientId = process.env.CLIENT_ID;
}

const commands = [
    new SlashCommandBuilder().setName('join').setDescription('دخول البوت للفويز'),
    new SlashCommandBuilder().setName('leave').setDescription('خروج البوت من الفويز'),
    
    // --- أمر بدء المسابقة (Giveaway) مع الخيارات الكاملة ---
    new SlashCommandBuilder().setName('gstart').setDescription('بدء مسابقة جديدة')
        .addStringOption(o => o.setName('prize').setDescription('اسم الجائزة أو الوصف').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('مدة المسابقة (مثلاً: 1m, 1h, 1d)').setRequired(true))
        .addIntegerOption(o => o.setName('winners').setDescription('عدد الفائزين المطلوب').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('طريقة المشاركة').setRequired(true)
            .addChoices(
                { name: 'زر (Button)', value: 'button' },
                { name: 'ريآكت (Reaction)', value: 'reaction' }
            )),
    
    new SlashCommandBuilder().setName('g-end').setDescription('إنهاء مسابقة يدوياً')
        .addStringOption(o => o.setName('msg-id').setDescription('رقم الرسالة').setRequired(true)),
    
    // أمر إضافة رد جديد عبر الـ Modal
    new SlashCommandBuilder().setName('add_reply').setDescription('إضافة رد جديد للنظام'),
    
    // أمر حذف رد تلقائي
    new SlashCommandBuilder().setName('delete_reply').setDescription('حذف رد تلقائي مخزن')
        .addStringOption(o => o.setName('trigger').setDescription('الكلمة المفتاحية للرد المراد حذفه').setRequired(true)),
    
    // --- أمر إرسال رسالة الإيمبد المخصصة ---
    new SlashCommandBuilder().setName('embed').setDescription('إرسال رسالة إيمبد مخصصة لأي روم مع تحديد اللون')
        .addChannelOption(o => o.setName('channel').setDescription('روم إرسال الإيمبد').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('محتوى رسالة الإيمبد').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('لون الإيمبد (مثال: #3498db)').setRequired(false)),

    new SlashCommandBuilder().setName('send_leave_panel').setDescription('إرسال لوحة طلب الإجازات'),
    
    // نظام الإجازات
    new SlashCommandBuilder().setName('setup_leave').setDescription('إعداد نظام الإجازات')
        .addChannelOption(o => o.setName('channel').setDescription('روم الإدارة').setRequired(true))
        .addChannelOption(o => o.setName('log').setDescription('روم السجلات').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('رتبة الإجازة').setRequired(true)),
    
    new SlashCommandBuilder().setName('set_welcome').setDescription('تفعيل نظام الترحيب')
        .addChannelOption(o => o.setName('channel').setDescription('روم الترحيب').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('رسالة الترحيب استخدم {user} للإشارة').setRequired(true)),
    
    new SlashCommandBuilder().setName('stop_welcome').setDescription('إيقاف نظام الترحيب'),
    new SlashCommandBuilder().setName('list_replies').setDescription('عرض الردود المخزنة'),
    new SlashCommandBuilder().setName('leave_logs').setDescription('سجل إجازاتك'),
    new SlashCommandBuilder().setName('all_leaves').setDescription('عرض سجل إجازات الجميع'),

    // إعداد رومات الكت المخصصة
    new SlashCommandBuilder().setName('setup_kt').setDescription('إعداد روم مخصص لأوامر الكت')
        .addChannelOption(o => o.setName('channel').setDescription('روم الكت المخصص').setRequired(true)),

    // --- أمر نظام الاقتراحات العام لكل السيرفرات ---
    new SlashCommandBuilder().setName('setup_suggestions').setDescription('إعداد وتحديد روم الاقتراحات (منتدى Forum)')
        .addChannelOption(o => 
            o.setName('channel')
             .setDescription('روم المنتدى (Forum) المخصص للاقتراحات')
             .addChannelTypes(ChannelType.GuildForum)
             .setRequired(true)
        ),

    // --- أوامر نظام الأغاني ---
    new SlashCommandBuilder().setName('play').setDescription('تشغيل أغنية أو البحث عنها ورابط يوتيوب')
        .addStringOption(o => o.setName('query').setDescription('اسم الأغنية أو رابط يوتيوب').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('تخطي الأغنية الحالية'),
    new SlashCommandBuilder().setName('stop').setDescription('إيقاف الأغاني ومغادرة الفويز'),
    new SlashCommandBuilder().setName('queue').setDescription('عرض قائمة الأغاني الانتظارية (Queue)'),
    new SlashCommandBuilder().setName('volume').setDescription('التحكم بمستوى صوت البوت')
        .addIntegerOption(o => o.setName('level').setDescription('مستوى الصوت من 1 إلى 100').setRequired(true)),
    new SlashCommandBuilder().setName('setup_music_panel').setDescription('إرسال لوحة تحكم الأغاني التفاعلية للروم الحالي'),

    // --- أوامر نظام الإعلانات الجديدة ---
    new SlashCommandBuilder().setName('set_ad_role').setDescription('تحديد رتبة الإدارة الخاصة بنظام الإعلانات')
        .addRoleOption(o => o.setName('role').setDescription('رتبة الإدارة المسموحة').setRequired(true)),
    
    // أمر فتح نموذج الإعلان المباشر
    new SlashCommandBuilder().setName('ad').setDescription('بدء إعلان جديد عبر تعبئة النموذج مباشرة')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('جاري تحديث جميع الأوامر العامة لكل السيرفرات...');
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ تم تحديث جميع الأوامر العامة بنجاح!');
    } catch (error) { 
        console.error('❌ حدث خطأ أثناء التحديث:', error); 
    }
})();