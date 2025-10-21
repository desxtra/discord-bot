// handlers/interactionHandler.js
const { getQueue, createQueueEmbed } = require('../utils/music');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const queue = getQueue(interaction.guildId);
    if (!queue?.currentSong) {
      await interaction.deferUpdate();
      return;
    }

    try {
      const { customId } = interaction;
      switch (customId) {
        case 'music_pause': {
          if (queue.isPaused) {
            queue.resume();
          } else {
            queue.pause();
          }
          // Just update the main message
          await queue.updateEmbed(interaction.message);
          await interaction.deferUpdate();
          break;
        }

        case 'music_skip': {
          queue.skip();
          // Just update the main message
          try { await queue.updateEmbed(interaction.message); } catch {}
          await interaction.deferUpdate();
          break;
        }

        case 'music_stop': {
          queue.stop();
          await queue.updateEmbed(interaction.message, true); // disable controls
          await interaction.deferUpdate();
          break;
        }

        case 'music_loop': {
          const status = queue.toggleLoop();
          await queue.updateEmbed(interaction.message);
          await interaction.deferUpdate();
          break;
        }

        case 'music_queue': {
          const qEmbed = createQueueEmbed(queue);
          // For queue, we'll show an ephemeral message since it's informational
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
