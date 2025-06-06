const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { google } = require('googleapis');
const config = require('../../config.json');
const creds = require('../../google-creds.json');

const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

function updateRefereeLine(original, role, userId) {
    const lines = original.split('\n');
    const index = lines.findIndex(line => line.toLowerCase().startsWith(`${role.toLowerCase()}:`));
    if (index !== -1) {
        lines[index] = `${role}: <@${userId}>`;
    }
    return lines.join('\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('requestcover')
        .setDescription('(REFEREE) Request a cover for your match')
        .addStringOption(option =>
            option.setName('match_id')
                .setDescription('Match ID')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('server_link')
                .setDescription('Private server invite (hidden)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const matchId = interaction.options.getString('match_id');
        const serverLink = interaction.options.getString('server_link');
        const requester = interaction.user;

        // ✅ Fetch match data
        let matchRow;
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetId,
                range: 'MATCHES!A2:G',
            });
            const rows = res.data.values;
            matchRow = rows.find(row => row[0] === matchId);
        } catch (err) {
            console.error('❌ Sheets error:', err);
            return interaction.reply({ content: '❌ Could not access match data.', ephemeral: true });
        }

        if (!matchRow || !matchRow[6]) {
            return interaction.reply({ content: `❌ Match ID \`${matchId}\` not found or missing message ID.`, ephemeral: true });
        }

        const [_, competition, round, team1, team2, time, messageId] = matchRow;

        // ✅ Send Cover Request Message
        const coverEmbed = new EmbedBuilder()
            .setAuthor({
                name: 'LA LEGA - Cover Request',
                iconURL: config.logoURL,
            })
            .setTitle(`🆘 Match Cover Request: ${matchId}`)
            .addFields([
                { name: 'Competition', value: competition, inline: true },
                { name: 'Round', value: round, inline: true },
                { name: 'Time', value: time, inline: false },
                { name: 'Team 1', value: team1, inline: true },
                { name: 'Team 2', value: team2, inline: true },
                {
                    name: '\u200B',
                    value: `Main Referee: <@${requester.id}>\nCover Referee: TBD\nMedia: TBD\nStats: TBD`,
                    inline: false,
                },
            ])
            .setColor(0xFFA500)
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId(`cover_${matchId}`)
            .setLabel('Cover This Match')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        const channel = interaction.client.channels.cache.get(config.matchAnnouncementChannelId);
        if (!channel) {
            return interaction.reply({ content: '❌ Channel not found.', ephemeral: true });
        }

        const coverRequestMessage = await channel.send({
            content: `<@&${config.refereeRoleId}>`,
            embeds: [coverEmbed],
            components: [row],
        });

        await interaction.reply({ content: '✅ Cover request posted.', ephemeral: true });

        // 🔁 Button Collector
        const collector = coverRequestMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 5 * 60 * 1000,
            max: 1,
        });

        collector.on('collect', async i => {
            if (i.user.id === requester.id) {
                return i.reply({ content: '❌ You can’t cover your own match.', ephemeral: true });
            }

            try {
                // Re-fetch match data to check current Cover Referee
                const refetchRes = await sheets.spreadsheets.values.get({
                    spreadsheetId: config.spreadsheetId,
                    range: 'MATCHES!A2:K',
                });
                const refetchRows = refetchRes.data.values;
                const refetchedRow = refetchRows.find(row => row[0] === matchId);

                if (!refetchedRow) {
                    return i.reply({ content: '❌ Match not found in Sheets.', ephemeral: true });
                }

                const currentCoverRef = refetchedRow[8]; // Column I: COVER REFEREE

                if (currentCoverRef && currentCoverRef !== '') {
                    return i.reply({ content: '❌ This match already has a cover referee assigned.', ephemeral: true });
                }

                // Fetch original match message
                const originalMatchMessage = await channel.messages.fetch(messageId);
                const oldEmbed = originalMatchMessage.embeds[0];

                // Extract current mentions to keep media and stats as is
                // (we expect oldEmbed.fields to have a field with these mentions)
                const fieldValue = oldEmbed.fields.find(f => f.name === '\u200B')?.value || '';

                // Extract Media and Stats using RegEx or split
                const mediaMatch = fieldValue.match(/Media:\s*(.+)/);
                const statsMatch = fieldValue.match(/Stats:\s*(.+)/);
                const mediaMention = mediaMatch ? mediaMatch[1] : 'TBD';
                const statsMention = statsMatch ? statsMatch[1] : 'TBD';

                // Update embed with new Cover Referee but keep Media & Stats as before
                const updatedEmbed = EmbedBuilder.from(oldEmbed).setFields([
                    { name: 'Competition', value: competition, inline: true },
                    { name: 'Round', value: round, inline: true },
                    { name: 'Time', value: time, inline: false },
                    { name: 'Team 1', value: team1, inline: true },
                    { name: 'Team 2', value: team2, inline: true },
                    {
                        name: '\u200B',
                        value: `Main Referee: <@${requester.id}>\nCover Referee: <@${i.user.id}>\nMedia: ${mediaMention}\nStats: ${statsMention}`,
                        inline: false,
                    },
                ]);

                await originalMatchMessage.edit({ embeds: [updatedEmbed] });

                // Update Sheets with new Cover Referee
                await sheets.spreadsheets.values.update({
                    spreadsheetId: config.spreadsheetId,
                    range: `MATCHES!I${refetchRows.indexOf(refetchedRow) + 2}`, // +2 for 1-based + header
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[i.user.id]],
                    }
                });

                // DM Cover Referee the server link
                try {
                    await i.user.send(`✅ You are covering match \`${matchId}\`. Server link: ${serverLink}`);
                } catch {
                    await i.reply({ content: '⚠️ Could not DM you. Please enable DMs.', ephemeral: true });
                }

                await i.reply({ content: `✅ You are now covering match \`${matchId}\`.`, ephemeral: true });

                // Disable button after success
                const disabledRow = new ActionRowBuilder().addComponents(
                    ButtonBuilder.from(button).setDisabled(true)
                );
                await coverRequestMessage.edit({ components: [disabledRow] });

            } catch (err) {
                console.error('❌ Failed to update match embed:', err);
                await i.reply({ content: '❌ Failed to update match embed.', ephemeral: true });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                coverRequestMessage.edit({
                    components: [],
                    content: `❌ Cover request for match \`${matchId}\` expired.`,
                });
            }
        });
    },
};
