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
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    registerCommands(client);
});

// Handle interactions
client.on('interactionCreate', async interaction => {
    await interactionCreate(interaction, client);
});

// Login the bot
client.login(process.env.DISCORD_TOKEN);