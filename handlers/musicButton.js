const { getVoiceConnection } = require('@discordjs/voice');
const { musicQueues } = require('../commands/music.js');

async function handleMusicButton(interaction) {
    const [action, guildId] = interaction.customId.split('_');
    const queue = musicQueues.get(guildId);

    if (!queue) {
        return await interaction.reply({ 
            content: 'There is no active music queue!', 
            ephemeral: true 
        });
    }

    try {
        switch (action) {
            case 'pause':
                if (queue.player.state.status === 'paused') {
                    return await interaction.reply({ 
                        content: 'The music is already paused!', 
                        ephemeral: true 
                    });
                }
                queue.player.pause();
                await interaction.reply({ 
                    content: 'Paused the music!', 
                    ephemeral: true 
                });
                break;

            case 'resume':
                if (queue.player.state.status === 'playing') {
                    return await interaction.reply({ 
                        content: 'The music is already playing!', 
                        ephemeral: true 
                    });
                }
                queue.player.unpause();
                await interaction.reply({ 
                    content: 'Resumed the music!', 
                    ephemeral: true 
                });
                break;

            case 'skip':
                if (!queue.songs.length) {
                    return await interaction.reply({ 
                        content: 'There are no songs to skip!', 
                        ephemeral: true 
                    });
                }
                const skippedSong = queue.songs[0];
                queue.player.stop();
                await interaction.reply({ 
                    content: `Skipped **${skippedSong.title}**`, 
                    ephemeral: true 
                });
                break;

            case 'stop':
                queue.songs = [];
                queue.player.stop();
                const connection = getVoiceConnection(guildId);
                if (connection) {
                    connection.destroy();
                }
                musicQueues.delete(guildId);
                await interaction.reply({ 
                    content: 'Stopped the music and cleared the queue!', 
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
        console.error('Error handling music button:', error);
        await interaction.reply({ 
            content: 'There was an error while processing the button!', 
            ephemeral: true 
        });
    }
}

module.exports = handleMusicButton;
