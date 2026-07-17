const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const { getDocs } = require('../utils/docs');
const { getDocsPages, searchDocsPages, getOgImageUrl } = require('../utils/docsPages');
const resources = require('../config/resources');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('docs')
        .setDescription('Get links to Noctalia documentation and resources')
        .addStringOption(option =>
            option
                .setName('page')
                .setDescription('Search for a specific documentation page')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const matches = await searchDocsPages(focusedValue);

        await interaction.respond(
            matches.map(page => ({
                name: page.displayName.length > 100 ? page.displayName.substring(0, 97) + '...' : page.displayName,
                value: page.slug,
            }))
        );
    },
    async execute(interaction) {
        const pageSlug = interaction.options.getString('page');

        if (pageSlug) {
            const pages = await getDocsPages();
            const page = pages.find(p => p.slug === pageSlug);

            if (!page) {
                const errorEmbed = createEmbed.error({
                    title: '❌ Page Not Found',
                    description: `Could not find that documentation page. Use \`/docs page:\` and pick a suggestion, or use \`/docs\` without a page to browse.`,
                });
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            const embed = createEmbed.info({
                title: `📖 ${page.title}`,
                description: `**[View Page](${page.url})**`,
                image: page.ogImage,
                footer: `Section: ${page.section} • Use /docs to browse all documentation`,
            });

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Fetch docs from API only (no fallback)
        let docs;
        try {
            docs = await getDocs();
        } catch (error) {
            console.error('Failed to fetch docs:', error);
            const errorEmbed = createEmbed.error({
                title: '❌ Documentation API Unavailable',
                description: `Unable to fetch documentation from the API. Please try again later.\n\n**[View Docs](${resources.docs.main})**`,
            });
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            return;
        }
        
        const embed = createEmbed.info({
            title: '📚 Noctalia Documentation',
            description: `**[📖 View Full Documentation](${docs.main})**\n\nQuick access to guides and resources for Noctalia.`,
            image: getOgImageUrl(''),
            fields: [
                {
                    name: '📋 Documentation Sections',
                    value: `• [🚀 Getting Started](${docs.gettingStarted})\n• [⚙️ Configuration](${docs.configuration})\n• [🎨 Theming](${docs.theming})\n• [💻 Development](${docs.development})\n• [❓ FAQ](${docs.faq})`,
                    inline: false,
                },
                {
                    name: '🔗 Community & Resources',
                    value: `[GitHub](${resources.github}) • [Website](${resources.website})`,
                    inline: false,
                },
            ],
            footer: `Need help? Check the FAQ first, if you can't solve the problem, create a thread in #issues!`,
        });

        await interaction.reply({ embeds: [embed] });
    },
};

