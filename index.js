require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const { registerCommands } = require('./handlers/commandHandler');
const { interactionCreate } = require('./handlers/interactionHandler');
const { AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN is not set in environment variables');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    allowedMentions: { parse: ['users', 'roles'] }
});

client.commands = new Collection();
client.musicQueues = new Map();

// Register commands when the bot is ready
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        await registerCommands(client);
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
    await interactionCreate(interaction, client);
});

// Handle voice state updates for cleanup
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // If the bot was disconnected from a voice channel
    if (oldState.member.id === client.user.id && !newState.channelId) {
        const queue = client.musicQueues.get(oldState.guild.id);
        if (queue) {
            console.log(`Bot was disconnected from voice channel in ${oldState.guild.name}`);
            queue.songs = [];
            if (queue.player) {
                queue.player.stop();
            }
            client.musicQueues.delete(oldState.guild.id);
        }
    }
    
    // If everyone leaves the voice channel
    if (oldState.channelId && oldState.channel?.members.size === 1 && oldState.channel.members.has(client.user.id)) {
        const queue = client.musicQueues.get(oldState.guild.id);
        if (queue) {
            console.log(`Everyone left the voice channel in ${oldState.guild.name}, cleaning up...`);
            queue.songs = [];
            if (queue.player) {
                queue.player.stop();
            }
            if (queue.connection) {
                queue.connection.destroy();
            }
            client.musicQueues.delete(oldState.guild.id);
        }
    }
});

// Error handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    
    // Clean up all voice connections
    for (const [guildId, queue] of client.musicQueues) {
        if (queue.connection) {
            queue.connection.destroy();
        }
    }
    
    client.destroy();
    process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});