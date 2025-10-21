const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Load commands
client.commands = new Map();
const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (Array.isArray(command)) {
        command.forEach(cmd => client.commands.set(cmd.data.name, cmd));
    } else {
        client.commands.set(command.data.name, command);
    }
}

// Load handlers
const handlerFiles = fs.readdirSync('./handlers').filter(f => f.endsWith('.js'));
for (const file of handlerFiles) {
    require(`./handlers/${file}`)(client);
}

// Deploy commands
async function deployCommands() {
    const commands = [];
    client.commands.forEach(cmd => commands.push(cmd.data.toJSON()));

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Deploying slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('Commands deployed successfully.');
    } catch (error) {
        console.error('Deploy error:', error);
    }
}

client.once('ready', async () => {
    console.log(`Bot ready as ${client.user.tag}`);
    await deployCommands();
});

client.login(process.env.DISCORD_TOKEN);