const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const { addWatch, removeWatch, removeChannelWatches, getGuildWatches } = require('../utils/githubWatches');

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;

function parseRepo(input) {
    let cleaned = input.trim().replace(/\.git$/, '');

    const urlMatch = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\/|$)/);
    if (urlMatch) {
        return { owner: urlMatch[1], repo: urlMatch[2] };
    }

    const parts = cleaned.split('/');
    if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('Manage GitHub repository watches')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Watch a GitHub repo and post events to a channel')
                .addStringOption(option =>
                    option.setName('repo')
                        .setDescription('Repository (e.g., "owner/repo" or full URL)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('branch')
                        .setDescription('Branch to watch (e.g., "main", "develop")')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel for notifications')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Stop watching a repo in a channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to remove watch from')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('repo')
                        .setDescription('Restrict to a specific repo (optional)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all GitHub watches in this server')),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'add':
                    await handleAdd(interaction);
                    break;
                case 'remove':
                    await handleRemove(interaction);
                    break;
                case 'list':
                    await handleList(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error executing github command:', error);
            const errorEmbed = createEmbed.error({
                title: 'Error',
                description: 'An error occurred while executing this command.',
            });
            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    },
};

async function handleAdd(interaction) {
    const repoInput = interaction.options.getString('repo');
    const branch = interaction.options.getString('branch');
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
        const errorEmbed = createEmbed.error({
            title: 'Invalid Channel',
            description: 'Please select a text channel.',
        });
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
    }

    const parsed = parseRepo(repoInput);
    if (!parsed) {
        const errorEmbed = createEmbed.error({
            title: 'Invalid Repository',
            description: 'Could not parse repository. Use format `owner/repo` or a full GitHub URL.',
        });
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
    }

    const { owner, repo } = parsed;
    const watchId = await addWatch(interaction.guild.id, channel.id, owner, repo, branch, interaction.user.id);
    const webhookUrl = `http://<your-server>:${WEBHOOK_PORT}/github`;

    const successEmbed = createEmbed.success({
        title: 'Watch Added',
        description: `**${owner}/${repo}** (\`${branch}\`) → ${channel}\n\n**ID:** \`${watchId}\``,
        fields: [
            {
                name: 'Next Step',
                value: `Add this webhook URL in your GitHub repo settings:\n\`${webhookUrl}\`\n\nSet **Content type** to \`application/json\`.`,
                inline: false,
            },
        ],
    });
    await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

async function handleRemove(interaction) {
    const channel = interaction.options.getChannel('channel');
    const repoInput = interaction.options.getString('repo');
    const watches = await getGuildWatches(interaction.guild.id);
    const channelWatches = watches.filter(w => w.channelId === channel.id);

    if (channelWatches.length === 0) {
        const errorEmbed = createEmbed.error({
            title: 'Not Found',
            description: `No watches configured for ${channel}.`,
        });
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
    }

    if (repoInput) {
        const parsed = parseRepo(repoInput);
        if (!parsed) {
            const errorEmbed = createEmbed.error({
                title: 'Invalid Repository',
                description: 'Could not parse repository. Use format `owner/repo` or a full GitHub URL.',
            });
            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        await removeChannelWatches(interaction.guild.id, channel.id, parsed.owner, parsed.repo);
        const successEmbed = createEmbed.success({
            title: 'Watch Removed',
            description: `Stopped watching **${parsed.owner}/${parsed.repo}** in ${channel}.`,
        });
        await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        return;
    }

    if (channelWatches.length === 1) {
        await removeWatch(interaction.guild.id, channelWatches[0].id);
        const { owner, repo } = channelWatches[0];
        const successEmbed = createEmbed.success({
            title: 'Watch Removed',
            description: `Stopped watching **${owner}/${repo}** in ${channel}.`,
        });
        await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        return;
    }

    const list = channelWatches.map(w => `\`${w.id}\` — **${w.owner}/${w.repo}** (\`${w.branch}\`)`).join('\n');
    const errorEmbed = createEmbed.error({
        title: 'Multiple Watches',
        description: `${channel} has multiple watches. Use \`/github remove\` with \`repo\` to specify which one, or use the ID:\n\n${list}`,
    });
    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
}

async function handleList(interaction) {
    const watches = await getGuildWatches(interaction.guild.id);

    if (watches.length === 0) {
        const embed = createEmbed.info({
            title: 'GitHub Watches',
            description: 'No GitHub repositories are being watched in this server.',
        });
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
    }

    const fields = watches.map(w => ({
        name: `${w.owner}/${w.repo}`,
        value: `**Branch:** \`${w.branch}\`\n**Channel:** <#${w.channelId}>\n**ID:** \`${w.id}\`\n**Added by:** <@${w.createdBy}>`,
        inline: false,
    }));

    const embed = createEmbed.info({
        title: 'GitHub Watches',
        description: `${watches.length} watch(es) configured.`,
        fields,
    });
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
