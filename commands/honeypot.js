const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const { addHoneypotChannel, removeHoneypotChannel } = require('../utils/honeypots');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('honeypot')
        .setDescription('Mark a channel as a honeypot trap')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to use as a honeypot')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Enable or disable the honeypot on this channel')
                .addChoices(
                    { name: 'Enable', value: 'enable' },
                    { name: 'Disable', value: 'disable' },
                )
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = interaction.options.getChannel('channel');
        const action = interaction.options.getString('action') || 'enable';

        if (!channel.isTextBased() || channel.type === ChannelType.GuildForum) {
            const errorEmbed = createEmbed.error({
                title: '❌ Invalid Channel',
                description: 'Please select a text channel.',
            });
            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            if (action === 'disable') {
                await removeHoneypotChannel(interaction.guild.id, channel.id);

                const successEmbed = createEmbed.success({
                    title: '✅ Honeypot Disabled',
                    description: `${channel} is no longer a honeypot channel.`,
                });
                await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            await addHoneypotChannel(interaction.guild.id, channel.id, interaction.user.id);

            const successEmbed = createEmbed.success({
                title: '🍯 Honeypot Enabled',
                description: `${channel} is now a honeypot channel.\n\nAnyone who posts here will be banned and have their recent messages removed.`,
                fields: [
                    {
                        name: '⚠️ Testing mode',
                        value: 'Triggers are currently logged to the bot console only.',
                        inline: false,
                    },
                ],
            });
            await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Error executing honeypot command:', error);
            const errorEmbed = createEmbed.error({
                title: '❌ Error',
                description: 'An error occurred while updating the honeypot configuration.',
            });
            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    },
};
