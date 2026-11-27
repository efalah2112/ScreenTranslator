const maker = require('./maker');

module.exports = (client, deps) => {
    client.on('interactionCreate', async (interaction) => {
        // ===== MAKER INTERACTIONS =====
        if (maker.isMakerCommand(interaction.commandName) || 
            (interaction.isButton() && (
                interaction.customId === 'add_token' ||
                interaction.customId === 'delete_token' ||
                interaction.customId === 'show_tokens' ||
                interaction.customId === 'change_ownership' ||
                interaction.customId === 'shutdown' ||
                interaction.customId === 'restart' ||
                interaction.customId.startsWith('delete_token_')
            )) ||
            interaction.isModalSubmit()) {
            return await maker.handleMakerInteraction(interaction, client, deps.config, deps.db, require('fs'));
        }
    });
};