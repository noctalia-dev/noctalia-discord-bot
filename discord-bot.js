require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { registerCommands, setupInteractionHandler } = require('./handlers/commandHandler');
const { setupReactionRoleHandler } = require('./handlers/reactionRoleHandler');
const { setupHoneypotHandler } = require('./handlers/honeypotHandler');
const { setupGithubWebhookHandler } = require('./handlers/githubWebhookHandler');
const { updateBotStatus } = require('./utils/status');
const { syncRulesMessage, setupRulesFileWatcher } = require('./utils/rulesSync');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
    ],
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error('Error: DISCORD_TOKEN environment variable is not set!');
    console.error('Please create a .env file with your Discord bot token.');
    process.exit(1);
}

setupInteractionHandler(client);
setupReactionRoleHandler(client);
setupHoneypotHandler(client);
setupGithubWebhookHandler(client);

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot is ready and online!`);
    
    const faqCommand = require('./commands/faq');
    if (faqCommand.initializeFAQChoices) {
        console.log('Fetching FAQs to build command choices...');
        await faqCommand.initializeFAQChoices();
        console.log('FAQ choices initialized, registering commands...');
    }
    
    const guildId = '1401598189823590460';
    
    await registerCommands(client.user.id, guildId, token);
    await updateBotStatus(client);
    setInterval(() => updateBotStatus(client), 15 * 60 * 1000);

    await syncRulesMessage(client);
    setupRulesFileWatcher(client);
});

client.login(token).catch((error) => {
    console.error('Error logging in:', error);
    process.exit(1);
});

