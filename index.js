require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { registerCommands } = require('./handlers/commandHandler');
const { interactionCreate } = require('./handlers/interactionHandler');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.musicQueues = new Map();

// Register commands when the bot is ready
client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    registerCommands(client);
});

// Handle interactions
client.on('interactionCreate', async interaction => {
    await interactionCreate(interaction, client);
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Login the bot
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});