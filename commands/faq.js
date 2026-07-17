const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const { getFAQs, fetchFAQs } = require('../utils/docs');
const { getOgImageUrl } = require('../utils/docsPages');
const resources = require('../config/resources');

const FAQ_OG_IMAGE = getOgImageUrl('getting-started/faq');

let commandChoices = [];
let choicesInitialized = false;

async function initializeFAQChoices() {
    if (choicesInitialized) return;
    
    try {
        const faqs = await fetchFAQs();
        if (faqs && Array.isArray(faqs) && faqs.length > 0) {
            commandChoices = faqs.map(faq => ({
                name: faq.question.length > 100 ? faq.question.substring(0, 97) + '...' : faq.question,
                value: faq.id,
            }));
            choicesInitialized = true;
            console.log(`Initialized ${commandChoices.length} FAQ choices from API`);
        } else {
            console.warn('Could not fetch FAQs at startup, command choices will be empty');
            commandChoices = [];
            choicesInitialized = true;
        }
    } catch (error) {
        console.error('Failed to initialize FAQ choices:', error.message);
        commandChoices = [];
        choicesInitialized = true;
    }
}

initializeFAQChoices().catch(err => {
    console.error('Error initializing FAQ choices:', err);
});

function buildFAQCommand() {
    const command = new SlashCommandBuilder()
        .setName('faq')
        .setDescription('Frequently asked questions about Noctalia')
        .addStringOption(option => {
            option
                .setName('topic')
                .setDescription('Select a FAQ topic to view')
                .setRequired(false);
            
            if (commandChoices.length > 0) {
                option.addChoices(...commandChoices);
            }
            
            return option;
        });

    return command;
}

function groupFAQsByCategory(faqs) {
    const grouped = {};
    faqs.forEach(faq => {
        const category = faq.category || 'general';
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push(faq);
    });
    return grouped;
}

function formatCategoryName(category) {
    return category
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function categoryToUrlAnchor(category) {
    return category.replace(/&/g, '--');
}

function findFAQ(faqs, topicId) {
    return faqs.find(f => f.id === topicId) || null;
}

function cleanAstroSyntax(text) {
    if (!text) return text;
    
    return text
        .replace(/:::note\[([^\]]+)\]/g, '**$1**\n') // Convert :::note[title] to **title**
        .replace(/:::tip\[([^\]]+)\]/g, '**$1**\n') // Convert :::tip[title] to **title**
        .replace(/:::warning\[([^\]]+)\]/g, '**$1**\n') // Convert :::warning[title] to **title**
        .replace(/:::danger\[([^\]]+)\]/g, '**$1**\n') // Convert :::danger[title] to **title**
        .replace(/:::info\[([^\]]+)\]/g, '**$1**\n') // Convert :::info[title] to **title**
        .replace(/:::/g, '') // Remove closing ::: markers
        .replace(/\n{3,}/g, '\n\n') // Clean up excessive newlines
        .trim();
}

module.exports = {
    get data() {
        return buildFAQCommand();
    },
    initializeFAQChoices,
    async execute(interaction) {
        let faqs;
        try {
            faqs = await getFAQs();
        } catch (error) {
            console.error('Failed to fetch FAQs:', error);
            const errorEmbed = createEmbed.error({
                title: '❌ Documentation API Unavailable',
                description: `Unable to fetch FAQs from the documentation API. Please try again later.\n\n**[View FAQ on Docs](${resources.docs.faq})**`,
            });
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            return;
        }
        
        const topicId = interaction.options.getString('topic');

        // If no topic is selected, show the list
        if (!topicId) {
            const grouped = groupFAQsByCategory(faqs);
            const fields = [];

            // Create fields for each category
            Object.keys(grouped).sort().forEach(category => {
                const categoryFAQs = grouped[category];
                const categoryAnchor = categoryToUrlAnchor(category);
                const categoryUrl = `${resources.docs.faq}#${categoryAnchor}`;
                const faqList = categoryFAQs
                    .map(faq => {
                        return `• ${faq.question}`;
                    })
                    .join('\n');
                
                // Discord embed field value limit is 1024 characters
                if (faqList.length > 1024) {
                    // Split into multiple fields if needed
                    const chunks = [];
                    let currentChunk = '';
                    categoryFAQs.forEach(faq => {
                        const line = `• ${faq.question}\n`;
                        if (currentChunk.length + line.length > 1024) {
                            chunks.push(currentChunk.trim());
                            currentChunk = line;
                        } else {
                            currentChunk += line;
                        }
                    });
                    if (currentChunk) chunks.push(currentChunk.trim());
                    
                    chunks.forEach((chunk, index) => {
                        const categoryName = index === 0 
                            ? `${formatCategoryName(category)} - [View Category](${categoryUrl})`
                            : '\u200b';
                        fields.push({
                            name: categoryName,
                            value: chunk,
                            inline: false,
                        });
                    });
                } else {
                    fields.push({
                        name: `${formatCategoryName(category)} - [View Category](${categoryUrl})`,
                        value: faqList,
                        inline: false,
                    });
                }
            });

            const embed = createEmbed.info({
                title: '❓ Frequently Asked Questions',
                description: `Browse all available FAQ topics. Select a topic from the dropdown to view the answer.\n\n**[View Full FAQ on Docs](${resources.docs.faq})**`,
                image: FAQ_OG_IMAGE,
                fields: fields,
                footer: `Can't find what you're looking for? Check the full documentation or ask in #issues!`,
            });

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Handle selected FAQ topic
        const faq = findFAQ(faqs, topicId);
        
        if (!faq) {
            console.error(`FAQ not found for topicId: ${topicId}`);
            console.error(`Available FAQ IDs: ${faqs.map(f => f.id).slice(0, 5).join(', ')}...`);
            const errorEmbed = createEmbed.error({
                title: '❌ FAQ Not Found',
                description: `The FAQ topic was not found. Use \`/faq\` without a topic to see all available topics.`,
            });
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            return;
        }

        const categoryAnchor = categoryToUrlAnchor(faq.category || 'general');
        const categoryUrl = `${resources.docs.faq}#${categoryAnchor}`;
        const cleanedAnswer = cleanAstroSyntax(faq.answer);
        const embed = createEmbed.info({
            title: `❓ ${faq.question}`,
            description: `${cleanedAnswer}\n\n**[View Category on Docs](${categoryUrl})**`,
            image: FAQ_OG_IMAGE,
            footer: `Category: ${formatCategoryName(faq.category || 'general')} • Use /faq to see all FAQs`,
        });

        await interaction.reply({ embeds: [embed] });
    },
};

