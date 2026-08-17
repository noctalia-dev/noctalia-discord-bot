const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const { setLoggingChannel, removeLoggingChannel, getLoggingChannels } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Configure logging channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('moderation')
                .setDescription('Set the channel for kicks, bans, and timeouts')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to receive moderation logs')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('activity')
                .setDescription('Set the channel for leaves and deleted messages')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to receive activity logs')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable one category of logging')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Logging category to disable')
                        .addChoices(
                            { name: 'Moderation', value: 'moderation' },
                            { name: 'Activity', value: 'activity' },
                        )
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show the configured logging channels')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'moderation' || subcommand === 'activity') {
            const channel = interaction.options.getChannel('channel');
            await setLoggingChannel(interaction.guild.id, subcommand, channel.id, interaction.user.id);
            await interaction.reply({
                embeds: [createEmbed.success({
                    title: '✅ Logging Configured',
                    description: `${subcommand === 'moderation' ? 'Moderation' : 'Activity'} events will now be logged in ${channel}.`,
                })],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (subcommand === 'disable') {
            const type = interaction.options.getString('type');
            await removeLoggingChannel(interaction.guild.id, type);
            await interaction.reply({
                embeds: [createEmbed.success({
                    title: '✅ Logging Disabled',
                    description: `${type === 'moderation' ? 'Moderation' : 'Activity'} events will no longer be logged.`,
                })],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const channels = await getLoggingChannels(interaction.guild.id);
        await interaction.reply({
            embeds: [createEmbed.info({
                title: '📋 Logging Status',
                description:
                    `**Moderation:** ${channels.moderation ? `<#${channels.moderation}>` : 'Not configured'}\n` +
                    `**Activity:** ${channels.activity ? `<#${channels.activity}>` : 'Not configured'}`,
            })],
            flags: MessageFlags.Ephemeral,
        });
    },
};
