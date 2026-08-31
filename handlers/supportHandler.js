const {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
} = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const resources = require('../config/resources');
const supportConfig = require('../config/support');
const {
    buildCloseButtonComponents,
    buildSupportConfirmationComponents,
    buildTicketName,
    buildTicketTopic,
    getSupportProject,
    parseSupportButtonId,
    parseSupportConfirmationButtonId,
    parseTicketTopic,
    SUPPORT_CANCEL_BUTTON_ID,
    SUPPORT_CLOSE_BUTTON_ID,
} = require('../utils/support');

const creatingTickets = new Set();

function setupSupportHandler(client) {
    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton()) return;

        const projectKey = parseSupportButtonId(interaction.customId);
        if (projectKey) {
            await handleTicketPrompt(interaction, projectKey);
            return;
        }

        const confirmedProjectKey = parseSupportConfirmationButtonId(interaction.customId);
        if (confirmedProjectKey) {
            await handleTicketStart(interaction, confirmedProjectKey);
            return;
        }

        if (interaction.customId === SUPPORT_CANCEL_BUTTON_ID) {
            await interaction.update({
                content: 'No support session was opened.',
                embeds: [],
                components: [],
            });
            return;
        }

        if (interaction.customId === SUPPORT_CLOSE_BUTTON_ID) {
            await handleTicketClose(interaction);
        }
    });

    console.log('Support ticket handler initialized');
}

async function handleTicketPrompt(interaction, projectKey) {
    if (!interaction.inGuild()) return;

    const project = getSupportProject(projectKey);
    await interaction.reply({
        embeds: [createEmbed.info({
            title: `Open ${project.emoji} ${project.label} support session?`,
            description: 'This will create a temporary private channel visible to you and the support team.',
            footer: 'Choose Open support session to continue, or Cancel if you clicked by mistake.',
        })],
        components: buildSupportConfirmationComponents(projectKey),
        flags: MessageFlags.Ephemeral,
    });
}


async function handleTicketStart(interaction, projectKey) {
    if (!interaction.inGuild()) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const lockKey = `${interaction.guild.id}:${interaction.user.id}`;
    if (creatingTickets.has(lockKey)) {
        await interaction.editReply({
            content: 'Your support session is already being created. Please wait a moment.',
        });
        return;
    }

    creatingTickets.add(lockKey);

    try {
        const project = getSupportProject(projectKey);
        const existingTicket = findExistingTicket(interaction.guild, interaction.user.id);
        if (existingTicket) {
            await interaction.editReply({
                content: `You already have an active support session: ${existingTicket}.`,
            });
            return;
        }

        const staffRoles = resolveStaffRoles(interaction.guild);
        if (staffRoles.length === 0) {
            throw new Error(
                'No support staff role was found. Configure SUPPORT_STAFF_ROLE_IDS or SUPPORT_STAFF_ROLE_NAMES.',
            );
        }

        const category = resolveTicketCategory(interaction.guild);
        const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id);
        const topic = buildTicketTopic(interaction.user.id, projectKey);
        const permissionOverwrites = [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks,
                ],
            },
            {
                id: botMember.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            },
            ...staffRoles.map(role => ({
                id: role.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks,
                ],
            })),
        ];

        const channelOptions = {
            name: buildTicketName(projectKey, interaction.user.username),
            type: ChannelType.GuildText,
            topic,
            permissionOverwrites,
            reason: `Support session opened by ${interaction.user.tag} for ${project.label}`,
        };
        if (category) channelOptions.parent = category.id;

        const ticketChannel = await interaction.guild.channels.create(channelOptions);

        try {
            await ticketChannel.send({
                content: `${interaction.user}`,
                embeds: [createEmbed.info({
                    title: `${project.emoji} ${project.label} support session`,
                    description: [
                        `Welcome, ${interaction.user}. A support team member can help troubleshoot here.`,
                        '',
                        'This is a temporary conversation, not an issue tracker.',
                        `If this turns out to be a bug or feature request, please continue on [GitHub](${resources.github}) before closing the session.`,
                    ].join('\n'),
                    footer: 'Use the button below when the session is finished.',
                })],
                components: buildCloseButtonComponents(),
                // Staff access comes from channel permissions; do not ping the staff role.
                allowedMentions: {
                    users: [interaction.user.id],
                },
            });
        } catch (error) {
            await ticketChannel.delete('Failed to send support session welcome message').catch(() => {});
            throw error;
        }

        await interaction.editReply({
            content: `Your private ${project.label} support session is ready: ${ticketChannel}.`,
            allowedMentions: { users: [interaction.user.id] },
        });
    } catch (error) {
        console.error('[support] Failed to create ticket:', error);
        await interaction.editReply({
            embeds: [createEmbed.error({
                title: 'Could not open support session',
                description: 'Talia could not create the private channel. Check the configured role, category, and Manage Channels permission.',
            })],
        });
    } finally {
        creatingTickets.delete(lockKey);
    }
}

async function handleTicketClose(interaction) {
    if (!interaction.inGuild()) return;

    const ticket = parseTicketTopic(interaction.channel.topic);
    if (!ticket) {
        await interaction.reply({
            content: 'This button can only close a Talia support session.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id);
    const canClose = ticket.userId === interaction.user.id
        || member.permissions.has(PermissionFlagsBits.ManageChannels)
        || memberHasSupportRole(member);

    if (!canClose) {
        await interaction.reply({
            content: 'Only the person who opened this session or the support team can close it.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.reply({
        content: 'Closing this support session…',
        flags: MessageFlags.Ephemeral,
    });

    try {
        await interaction.channel.delete(`Support session closed by ${interaction.user.tag}`);
    } catch (error) {
        console.error('[support] Failed to delete ticket:', error);
        await interaction.followUp({
            content: 'I could not delete this channel. Check that I have Manage Channels permission.',
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
    }
}

function resolveTicketCategory(guild) {
    if (!supportConfig.categoryId) return null;

    const category = guild.channels.cache.get(supportConfig.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
        throw new Error(`Configured support category ${supportConfig.categoryId} was not found.`);
    }

    return category;
}

function resolveStaffRoles(guild) {
    if (supportConfig.staffRoleIds.length > 0) {
        return supportConfig.staffRoleIds
            .map(roleId => guild.roles.cache.get(roleId))
            .filter(Boolean);
    }

    return supportConfig.staffRoleNames
        .map(roleName => guild.roles.cache.find(role => role.name === roleName))
        .filter(Boolean);
}

function memberHasSupportRole(member) {
    if (supportConfig.staffRoleIds.length > 0) {
        return supportConfig.staffRoleIds.some(roleId => member.roles.cache.has(roleId));
    }

    return supportConfig.staffRoleNames.some(roleName =>
        member.roles.cache.some(role => role.name === roleName),
    );
}

function findExistingTicket(guild, userId) {
    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText
        && parseTicketTopic(channel.topic)?.userId === userId,
    );
}

module.exports = {
    findExistingTicket,
    memberHasSupportRole,
    resolveStaffRoles,
    setupSupportHandler,
};
