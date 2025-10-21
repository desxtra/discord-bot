// handlers/interactionHandler.js
const { getQueue, createQueueEmbed } = require('../utils/music');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const queue = getQueue(interaction.guildId);
    if (!queue?.currentSong) {
      return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
    }

    // acknowledge quickly (ephemeral)
    await interaction.deferReply({ ephemeral: true });

    try {
      const { customId } = interaction;
      switch (customId) {
        case 'music_pause': {
          if (queue.isPaused) {
            queue.resume();
            await interaction.editReply({ content: '▶️ Resumed.' });
          } else {
            queue.pause();
            await interaction.editReply({ content: '⏸️ Paused.' });
          }
          // update embed on message
          await queue.updateEmbed(interaction.message);
          break;
        }

        case 'music_skip': {
          queue.skip();
          await interaction.editReply({ content: '⏭️ Skipped.' });
          // embed will update on 'Idle' event when next song starts; optionally update immediately
          try { await queue.updateEmbed(interaction.message); } catch {}
          break;
        }

        case 'music_stop': {
          queue.stop();
          await queue.updateEmbed(interaction.message, true); // disable controls
          await interaction.editReply({ content: '⏹️ Stopped and cleared queue.' });
          break;
        }

        case 'music_loop': {
          const status = queue.toggleLoop();
          await interaction.editReply({ content: `🔁 Loop ${status ? 'ON' : 'OFF'}.` });
          await queue.updateEmbed(interaction.message);
          break;
        }

        case 'music_queue': {
          const qEmbed = createQueueEmbed(queue);
          await interaction.editReply({ embeds: [qEmbed] });
          break;
        }

        default:
          await interaction.editReply({ content: 'Unknown button.' });
      }
    } catch (err) {
      console.error('Button handler error:', err);
      try { await interaction.editReply({ content: 'Error handling button.', ephemeral: true }); } catch {}
    }
  });
};
