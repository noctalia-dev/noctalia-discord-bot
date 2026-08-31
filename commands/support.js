const {
    ChannelType,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const {
    buildSupportPanelComponents,
} = require('../utils/support');
const resources = require('../config/resources');
const supportConfig = require('../config/support');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Manage the temporary support session panel')
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Post the support session panel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Text channel where the panel should be posted')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(false))),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const configuredChannel = supportConfig.panelChannelId
            ? interaction.guild.channels.cache.get(supportConfig.panelChannelId)
            : null;
        const channel = interaction.options.getChannel('channel') || configuredChannel || interaction.channel;
        if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
            await interaction.editReply({
                embeds: [createEmbed.error({
                    title: 'Invalid support channel',
                    description: 'Choose a normal text channel for the support panel.',
                })],
            });
            return;
        }

        const panelEmbed = createEmbed.info({
            title: 'Need help?',
            description: [
                'For bugs and feature requests, please use GitHub so the work can be tracked.',
                'These buttons open support sessions; they are not reactions, votes, or project-support buttons.',
                'For quick questions or temporary troubleshooting, use one of the buttons in this message to start a private support session.',
                '',
                `Persistent issues belong on [GitHub](${resources.github}).`,
            ].join('\n'),
            footer: 'Support sessions are temporary and are not an issue queue.',
        });

        try {
            const message = await channel.send({
                embeds: [panelEmbed],
                components: buildSupportPanelComponents(),
            });

            await interaction.editReply({
                embeds: [createEmbed.success({
                    title: 'Support panel posted',
                    description: `The support panel is now in ${channel}.\n\n**Message ID:** \`${message.id}\``,
                })],
            });
        } catch (error) {
            console.error('[support] Failed to post panel:', error);
            await interaction.editReply({
                embeds: [createEmbed.error({
                    title: 'Could not post support panel',
                    description: 'Make sure Talia can view and send messages in the selected channel.',
                })],
            });
        }
    },
};
