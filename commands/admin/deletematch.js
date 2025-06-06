const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
const config = require('../../config.json');
const creds = require('../../google-creds.json');

const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletematch')
        .setDescription('Delete a match by Match ID')
        .addStringOption(option =>
            option.setName('match_id')
                .setDescription('Match ID to delete')
                .setRequired(true)),

    async execute(interaction) {
        const hasPermission = interaction.member.roles.cache.some(role =>
            config.adminRoleIds.includes(role.id)
        );

        if (!hasPermission) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const matchId = interaction.options.getString('match_id');

        try {
            // Get current match data
            const getRes = await sheets.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetId,
                range: 'MATCHES!A2:Z',
            });

            const rows = getRes.data.values;
            if (!rows) return interaction.reply({ content: '❌ No match data found.', ephemeral: true });

            const matchIndex = rows.findIndex(row => row[0] === matchId);
            if (matchIndex === -1) {
                return interaction.reply({ content: `❌ Match with ID \`${matchId}\` not found.`, ephemeral: true });
            }

            const rowToDelete = matchIndex + 1; // A2 is row 2 → +1 for 0-based index

            // Delete the row using the batchUpdate API
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: config.spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            deleteDimension: {
                                range: {
                                    sheetId: 0, // You may need to change this if MATCHES is not the first sheet
                                    dimension: 'ROWS',
                                    startIndex: rowToDelete,
                                    endIndex: rowToDelete + 1,
                                }
                            }
                        }
                    ]
                }
            });

            const embed = new EmbedBuilder()
                .setTitle(`🗑️ Match Deleted: ${matchId}`)
                .setColor(0xFF0000)
                .setDescription(`Match \`${matchId}\` has been removed from the database.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('❌ Error deleting match:', err);
            await interaction.reply({ content: '❌ Failed to delete match.', ephemeral: true });
        }
    }
};
