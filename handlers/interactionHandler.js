const { InteractionType } = require('discord.js');
const { AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');

module.exports = {
    async interactionCreate(interaction, client) {
        // Handle slash commands
        if (interaction.type === InteractionType.ApplicationCommand) {
            const command = client.commands.get(interaction.commandName);
            
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);
                
                const errorMessage = 'There was an error while executing this command!';
                
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ 
                            content: errorMessage, 
                            ephemeral: true
                        });
                    } else {
                        await interaction.reply({ 
                            content: errorMessage, 
                            ephemeral: true
                        });
                    }
                } catch (replyError) {
                    // Ignore "unknown interaction" and "already acknowledged" errors
                    if (replyError.code !== 10062 && replyError.code !== 40060) {
                        console.error('Failed to send error message:', replyError);
                    }
                }
            }
        }
        
        // Handle button interactions
        if (interaction.isButton()) {
            try {
                const [action, guildId] = interaction.customId.split('_');
                
                if (guildId !== interaction.guildId) {
                    return await interaction.reply({ 
                        content: 'This button is not for this server!', 
                        ephemeral: true 
                    });
                }

                const queue = client.musicQueues.get(interaction.guildId);
                
                if (!queue) {
                    return await interaction.reply({ 
                        content: 'No music is currently playing!', 
                        ephemeral: true 
                    });
                }

                // Check if user is in the same voice channel
                const voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel || voiceChannel.id !== queue.voiceChannel.id) {
                    return await interaction.reply({
                        content: 'You need to be in the same voice channel to control the music!',
                        ephemeral: true
                    });
                }

                switch (action) {
                    case 'pause':
                        if (queue.player.state.status === AudioPlayerStatus.Playing) {
                            queue.player.pause();
                            await interaction.reply({ 
                                content: '⏸️ Music paused!', 
                                ephemeral: true 
                            });
                        } else {
                            await interaction.reply({ 
                                content: 'Music is not playing!', 
                                ephemeral: true 
                            });
                        }
                        break;
                        
                    case 'resume':
                        if (queue.player.state.status === AudioPlayerStatus.Paused) {
                            queue.player.unpause();
                            await interaction.reply({ 
                                content: '▶️ Music resumed!', 
                                ephemeral: true 
                            });
                        } else {
                            await interaction.reply({ 
                                content: 'Music is not paused!', 
                                ephemeral: true 
                            });
                        }
                        break;
                        
                    case 'skip':
                        if (queue.songs.length > 0) {
                            const skippedSong = queue.songs[0];
                            queue.player.stop();
                            await interaction.reply({ 
                                content: `⏭️ Skipped **${skippedSong.title}**`, 
                                ephemeral: true 
                            });
                        } else {
                            await interaction.reply({ 
                                content: 'No songs to skip!', 
                                ephemeral: true 
                            });
                        }
                        break;
                        
                    case 'stop':
                        queue.songs = [];
                        queue.player.stop();
                        if (queue.connection) {
                            queue.connection.destroy();
                        }
                        client.musicQueues.delete(interaction.guildId);
                        await interaction.reply({ 
                            content: '⏹️ Stopped the music and cleared the queue!', 
                            ephemeral: true 
                        });
                        break;
                        
                    default:
                        await interaction.reply({ 
                            content: 'Unknown button action!', 
                            ephemeral: true 
                        });
                }
            } catch (error) {
                console.error('Button interaction error:', error);
                try {
                    // Check if we can still reply
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ 
                            content: 'There was an error processing this button!', 
                            ephemeral: true 
                        });
                    } else {
                        await interaction.reply({ 
                            content: 'There was an error processing this button!', 
                            ephemeral: true 
                        });
                    }
                } catch (replyError) {
                    // Ignore "unknown interaction" and "already acknowledged" errors
                    if (replyError.code !== 10062 && replyError.code !== 40060) {
                        console.error('Failed to send button error message:', replyError);
                    }
                }
            }
        }
    }
};