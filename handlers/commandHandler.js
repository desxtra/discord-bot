const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');

module.exports = {
    registerCommands: async (client) => {
        const commands = [];
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const commandModule = require(filePath);
                
                // Handle both array and single command exports
                const commandArray = Array.isArray(commandModule) ? commandModule : [commandModule];
                
                for (const command of commandArray) {
                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        commands.push(command.data.toJSON());
                    } else {
                        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                    }
                }
            } catch (error) {
                console.error(`Error loading command ${file}:`, error);
            }
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        try {
            console.log('Started refreshing application (/) commands.');

            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );

            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Error refreshing commands:', error);
        }
    }
};