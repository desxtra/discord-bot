const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands } = require('./utils/commandLoader');
const { handleInteraction } = require('./utils/interactionHandler');
const { discord } = require('./core/config');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize collections
client.commands = new Collection();
client.musicQueues = new Collection();

// Load commands when bot starts
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await loadCommands(client);
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
    try {
        await handleInteraction(client, interaction);
    } catch (error) {
        console.error('Error handling interaction:', error);
        
        // Only reply if the interaction hasn't been replied to
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'There was an error executing this command.',
                ephemeral: true
            });
        }
    }
});

// Load all event handlers
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Start the bot
client.login(discord.token);