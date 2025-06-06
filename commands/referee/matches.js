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
        .setName('matches')
        .setDescription('View upcoming matches'),

    async execute(interaction) {
        try {
            const getRes = await sheets.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetId,
                range: 'MATCHES!A2:Z',
            });

            const rows = getRes.data.values || [];
            if (rows.length === 0) {
                return interaction.reply({ content: 'No upcoming matches found.', ephemeral: true });
            }

            const limitedRows = rows.slice(0, 10); // Top 10 only

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: "LA LEGA - Matches",
                    iconURL: "https://media.discordapp.net/attachments/1300416251189002252/1358780991430197339/AVL_SPIKE.png?ex=684430e9&is=6842df69&hm=125a72870ced326cdc65e000ddbc46702cfd99b32312482d091481cbd66709b5&",
                })
                .setImage("https://cdn.discordapp.com/attachments/1378750702159134750/1380628752740122624/Line.png?ex=68449239&is=684340b9&hm=fb4b87efc71b9f5fc42534614360354e794e6b785cfd565ad10d993f87dd89c5&")
                .setColor(0x00BFFF)
                .setTimestamp();

            for (const row of limitedRows) {
                const [matchId, competition, round, team1, team2, time] = row;
                embed.addFields(
                    {
                        name: "Competition",
                        value: competition,
                        inline: true
                    },
                    {
                        name: "Round",
                        value: `Round ${round}`,
                        inline: true
                    },
                    {
                        name: "Team 1",
                        value: team1,
                        inline: false
                    },
                    {
                        name: "Team 2",
                        value: team2,
                        inline: false
                    },
                    {
                        name: "Time",
                        value: time,
                        inline: false
                    },
                );

            }

            await interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Error fetching matches:', err);
            await interaction.reply({ content: '❌ Failed to fetch matches.', ephemeral: true });
        }
    }
};