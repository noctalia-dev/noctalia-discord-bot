const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getLoggingChannelId } = require('../utils/logging');

const AUDIT_LOG_DELAY_MS = 1500;
const AUDIT_LOG_MAX_AGE_MS = 15000;
const MESSAGE_CACHE_LIMIT = 10000;

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

function rememberMessage(recentlySeenMessages, data, isCreate) {
    if (!data.guild_id || !data.id || !data.channel_id) return;

    const cachedMessage = recentlySeenMessages.get(data.id);
    if (!cachedMessage && !data.author && typeof data.content !== 'string') return;
    const snapshot = {
        ...cachedMessage,
        channel: { id: data.channel_id },
    };

    if (data.author) {
        snapshot.author = {
            id: data.author.id,
            tag: data.author.discriminator && data.author.discriminator !== '0'
                ? `${data.author.username}#${data.author.discriminator}`
                : data.author.username,
            username: data.author.username,
            bot: data.author.bot ?? cachedMessage?.author?.bot ?? false,
        };
    }

    // An update can arrive before creation. Keep its newer text when creation follows.
    if (typeof data.content === 'string' && (!isCreate || snapshot.content == null)) {
        snapshot.content = data.content;
    }
    recentlySeenMessages.set(data.id, snapshot);

    if (recentlySeenMessages.size > MESSAGE_CACHE_LIMIT) {
        recentlySeenMessages.delete(recentlySeenMessages.keys().next().value);
    }
}

function setupLoggingHandler(client) {
    const recentlySeenMessages = new Map();

    // Raw events arrive before Discord.js processes them. A pre-existing partial
    // can cause the library to suppress messageCreate, so cache the payload directly.
    client.on('raw', packet => {
        if (packet.t !== 'MESSAGE_CREATE' && packet.t !== 'MESSAGE_UPDATE') return;
        rememberMessage(recentlySeenMessages, packet.d, packet.t === 'MESSAGE_CREATE');
    });

    client.on('messageDelete', async message => {
        if (!message.guild) return;

        const cachedMessage = recentlySeenMessages.get(message.id);
        recentlySeenMessages.delete(message.id);
        if (message.author?.bot || cachedMessage?.author?.bot) return;
        if (!await hasLoggingChannel(message.guild, 'activity')) return;

        // Deleted messages cannot be fetched. Prefer the raw snapshot, which also
        // retains edits that Discord.js may not have applied to its cached object.
        const author = cachedMessage?.author || message.author;
        const channel = message.channel || cachedMessage?.channel;
        const content = cachedMessage?.content ?? message.content;
        // Message-delete audit entries target the message author, not the message.
        const auditEntry = author
            ? await findAuditEntry(
                message.guild,
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
        await sendLog(message.guild, 'activity', {
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
