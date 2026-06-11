const { isHoneypotChannel } = require('../utils/honeypots');

// Set to false to actually ban users and purge their messages
const DRY_RUN = false;

const DELETE_MESSAGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Sets up the honeypot message handler
 * @param {import('discord.js').Client} client
 */
function setupHoneypotHandler(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const isTrap = await isHoneypotChannel(message.guild.id, message.channel.id);
        if (!isTrap) return;

        const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
        if (!member) return;

        if (DRY_RUN) {
            console.log(
                `[HONEYPOT] ${message.author.tag} (${message.author.id}) posted in #${message.channel.name} ` +
                `(${message.channel.id}) — would ban and delete messages from the last 7 days`
            );
            console.log(`[HONEYPOT] Message: ${message.content || '(no text content)'}`);
            return;
        }

        try {
            const botMember = await message.guild.members.fetch(message.client.user.id);

            if (!botMember.permissions.has('BanMembers')) {
                console.error('[HONEYPOT] Bot lacks BanMembers permission');
                return;
            }

            if (!member.bannable) {
                console.error(`[HONEYPOT] Cannot ban ${message.author.tag} — insufficient role hierarchy`);
                return;
            }

            await member.ban({
                reason: `Honeypot: posted in #${message.channel.name}`,
                deleteMessageSeconds: DELETE_MESSAGE_SECONDS,
            });

            console.log(`[HONEYPOT] Banned ${message.author.tag} (${message.author.id}) in ${message.guild.name}`);
        } catch (error) {
            console.error('[HONEYPOT] Failed to ban user:', error);
        }
    });

    console.log('Honeypot handler initialized');
}

module.exports = { setupHoneypotHandler };
