const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    registerCommands(client) {
        const commands = [];
        
        // Read command files
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const commandModule = require(filePath);
                
                // Handle both array and single command exports
                if (Array.isArray(commandModule)) {
                    commandModule.forEach(cmd => {
                        if (cmd.data && cmd.execute) {
                            client.commands.set(cmd.data.name, cmd);
                            commands.push(cmd.data.toJSON());
                        }
                    });
                } else if (commandModule.data && commandModule.execute) {
                    client.commands.set(commandModule.data.name, commandModule);
                    commands.push(commandModule.data.toJSON());
                }
            } catch (error) {
                console.error(`Error loading command ${file}:`, error);
            }
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        (async () => {
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
        })();
    }
};