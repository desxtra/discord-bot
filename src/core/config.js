require('dotenv').config();

module.exports = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID,
        ownerId: process.env.BOT_OWNER_ID
    },
    characterAI: {
        token: process.env.CHARACTERAI_TOKEN,
        characterId: process.env.CHARACTER_ID
    },
    bot: {
        prefix: '!',
        defaultVolume: 50,
        maxQueueSize: 100
    }
};