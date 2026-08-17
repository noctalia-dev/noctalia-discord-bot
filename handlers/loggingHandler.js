const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getLoggingChannelId } = require('../utils/logging');

const AUDIT_LOG_DELAY_MS = 1500;
const AUDIT_LOG_MAX_AGE_MS = 15000;
const MESSAGE_CACHE_LIMIT = 10000;
const recentlySeenMessages = new Map();

function truncate(value, maxLength) {
    if (!value) return null;
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatUser(user) {
    return `${user.tag || user.username} (${user.id})`;
}

async function hasLoggingChannel(guild, type) {
    return Boolean(await getLoggingChannelId(guild.id, type));
}

async function sendLog(guild, type, { title, color, fields = [], description }) {
    const channelId = await getLoggingChannelId(guild.id, type);
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setTimestamp();

    if (description) embed.setDescription(truncate(description, 4096));
    if (fields.length > 0) embed.addFields(fields.filter(field => field.value));

    await channel.send({ embeds: [embed] }).catch(error => {
        console.error(`[logging] Failed to send a log in guild ${guild.id}:`, error.message);
    });
}

async function findAuditEntry(guild, type, targetId, matches = () => true) {
    // Discord may add the audit entry just after the gateway event arrives.
    await new Promise(resolve => setTimeout(resolve, AUDIT_LOG_DELAY_MS));

    try {
        const logs = await guild.fetchAuditLogs({ type, limit: 6 });
        const now = Date.now();
        return logs.entries.find(entry =>
            entry.targetId === targetId &&
            now - entry.createdTimestamp <= AUDIT_LOG_MAX_AGE_MS &&
            matches(entry)
        ) || null;
    } catch (error) {
        console.warn(`[logging] Could not read audit logs for guild ${guild.id}: ${error.message}`);
        return null;
    }
}

function moderationDetails(user, auditEntry) {
    return `**User:** ${formatUser(user)}\n` +
        `**Moderator:** ${auditEntry?.executor ? formatUser(auditEntry.executor) : 'Unknown'}\n` +
        `**Reason:** ${auditEntry?.reason || 'No reason provided'}`;
}

function rememberMessage(message) {
    if (!message.guild || !message.author || message.author.bot) return;

    recentlySeenMessages.set(message.id, {
        author: {
            id: message.author.id,
            tag: message.author.tag,
            username: message.author.username,
        },
        channel: { id: message.channel.id },
        content: message.content,
    });

    if (recentlySeenMessages.size > MESSAGE_CACHE_LIMIT) {
        recentlySeenMessages.delete(recentlySeenMessages.keys().next().value);
    }
}

function setupLoggingHandler(client) {
    client.on('messageCreate', rememberMessage);

    client.on('messageDelete', async message => {
        if (!message.guild) return;
        if (!await hasLoggingChannel(message.guild, 'activity')) return;

        const cachedMessage = recentlySeenMessages.get(message.id);
        recentlySeenMessages.delete(message.id);
        const deletedMessage = message.partial
            ? await message.fetch().catch(() => message)
            : message;
        if (deletedMessage.author?.bot || cachedMessage?.author?.bot) return;

        const author = deletedMessage.author || cachedMessage?.author;
        const channel = deletedMessage.channel || cachedMessage?.channel;
        const content = deletedMessage.content || cachedMessage?.content;
        // Message-delete audit entries target the message author, not the message.
        const auditEntry = author
            ? await findAuditEntry(
                deletedMessage.guild,
                AuditLogEvent.MessageDelete,
                author.id,
                entry => entry.extra?.channel?.id === channel?.id
            )
            : null;

        const deletedBy = auditEntry?.executor
            ? formatUser(auditEntry.executor)
            : author
                ? formatUser(author)
                : 'Unknown';
        await sendLog(deletedMessage.guild, 'activity', {
            title: '🗑️ Message Deleted',
            color: 0xED4245,
            description:
                `**Author:** ${author ? formatUser(author) : 'Unknown'}\n` +
                `**Deleted by:** ${deletedBy}\n` +
                `**Channel:** ${channel ? `<#${channel.id}>` : 'Unknown'}\n` +
                `**Content:** ${content ? truncate(content, 1500) : '*Message content was unavailable*'}`,
        });
    });

    client.on('guildMemberRemove', async member => {
        const [hasModerationLog, hasActivityLog] = await Promise.all([
            hasLoggingChannel(member.guild, 'moderation'),
            hasLoggingChannel(member.guild, 'activity'),
        ]);
        if (!hasModerationLog && !hasActivityLog) return;

        // A ban also removes the member. Let guildBanAdd produce the single ban log.
        const [banEntry, auditEntry] = await Promise.all([
            findAuditEntry(member.guild, AuditLogEvent.MemberBanAdd, member.id),
            findAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id),
        ]);
        if (banEntry) return;

        if (auditEntry && hasModerationLog) {
            await sendLog(member.guild, 'moderation', {
                title: '👢 User Kicked',
                color: 0xED4245,
                fields: [{ name: 'Details', value: moderationDetails(member.user, auditEntry) }],
            });
            return;
        }

        if (!auditEntry && hasActivityLog) await sendLog(member.guild, 'activity', {
            title: '🚪 User Left',
            color: 0xFEE75C,
            description: formatUser(member.user),
        });
    });

    client.on('guildBanAdd', async ban => {
        if (!await hasLoggingChannel(ban.guild, 'moderation')) return;

        const auditEntry = await findAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        await sendLog(ban.guild, 'moderation', {
            title: '🔨 User Banned',
            color: 0xED4245,
            fields: [{ name: 'Details', value: moderationDetails(ban.user, auditEntry) }],
        });
    });

    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
        const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
        if (newTimeout <= Date.now() || newTimeout === oldTimeout) return;
        if (!await hasLoggingChannel(newMember.guild, 'moderation')) return;

        const auditEntry = await findAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        await sendLog(newMember.guild, 'moderation', {
            title: '⏳ User Timed Out',
            color: 0xFEE75C,
            description:
                `**User:** ${formatUser(newMember.user)}\n` +
                `**Moderator:** ${auditEntry?.executor ? formatUser(auditEntry.executor) : 'Unknown'}\n` +
                `**Reason:** ${auditEntry?.reason || 'No reason provided'}\n` +
                `**Timeout ends:** <t:${Math.floor(newTimeout / 1000)}:F>`,
        });
    });
}

module.exports = { setupLoggingHandler };
