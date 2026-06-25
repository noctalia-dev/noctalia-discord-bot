const crypto = require('crypto');
const express = require('express');
const { EmbedBuilder } = require('discord.js');
const { getWatches } = require('../utils/githubWatches');

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || null;

let clientInstance = null;

function setupGithubWebhookHandler(client) {
    clientInstance = client;
    startWebhookServer();
}

function verifySignature(payload, signature) {
    if (!WEBHOOK_SECRET) return true;

    const sig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

    return `sha256=${sig}` === signature;
}

function startWebhookServer() {
    const app = express();

    app.use(express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        }
    }));

    app.post('/github', async (req, res) => {
        if (WEBHOOK_SECRET) {
            const signature = req.headers['x-hub-signature-256'];
            if (!signature || !verifySignature(req.rawBody, signature)) {
                console.warn('GitHub webhook: invalid signature');
                return res.status(401).send('Unauthorized');
            }
        }

        const event = req.headers['x-github-event'];
        const payload = req.body;

        if (!payload || !payload.repository) {
            return res.send('OK');
        }

        const owner = payload.repository.owner?.login || payload.repository.owner?.name;
        const repo = payload.repository.name;

        const watches = await getWatches();

        const repoMatches = [];
        for (const [, guildWatches] of Object.entries(watches)) {
            for (const watch of guildWatches) {
                if (watch.owner === owner && watch.repo === repo) {
                    repoMatches.push(watch);
                }
            }
        }

        if (repoMatches.length === 0) {
            return res.send('OK');
        }

        if (event === 'push') {
            const results = handlePushEvent(payload);
            for (const { embed, branch } of results) {
                for (const w of repoMatches) {
                    if (branch === w.branch) {
                        await sendToChannel(w.channelId, embed);
                    }
                }
            }
        } else if (event === 'pull_request') {
            const results = handlePullRequestEvent(payload);
            for (const { embed, branch } of results) {
                for (const w of repoMatches) {
                    if (branch === w.branch) {
                        await sendToChannel(w.channelId, embed);
                    }
                }
            }
        }

        res.send('OK');
    });

    app.listen(WEBHOOK_PORT, () => {
        console.log(`GitHub webhook server listening on port ${WEBHOOK_PORT}`);
    });
}

function handlePushEvent(payload) {
    const ref = payload.ref || '';
    const branch = ref.replace('refs/heads/', '');

    if (!branch || !ref.startsWith('refs/heads/')) {
        return [];
    }

    const commits = payload.commits || [];
    if (commits.length === 0) return [];

    const repo = payload.repository;
    const sender = payload.sender || {};
    const repoFull = repo.full_name || `${repo.owner.login}/${repo.name}`;

    const MAX_DISPLAY = 5;
    const displayCommits = commits.slice(0, MAX_DISPLAY);
    const commitLines = displayCommits.map(c => {
        const sha = c.id.substring(0, 7);
        const msg = (c.message || '').split('\n')[0];
        return `[\`${sha}\`](${c.url}) ${msg}`;
    });

    let description = commitLines.join('\n');
    if (commits.length > MAX_DISPLAY) {
        description += `\n... and ${commits.length - MAX_DISPLAY} more commits`;
    }

    const embed = new EmbedBuilder()
        .setColor(0xc0b2fe)
        .setAuthor(makeAuthor(sender.login, sender.avatar_url))
        .setTitle(`[${repoFull}] ${commits.length} commit(s) on ${branch}`)
        .setURL(payload.compare || repo.html_url)
        .setDescription(description)
        .setTimestamp();

    return [{ embed, branch }];
}

function handlePullRequestEvent(payload) {
    const pr = payload.pull_request;
    if (!pr) return [];

    const action = payload.action;
    const baseBranch = pr.base?.ref;
    const repo = payload.repository;
    const repoFull = repo.full_name || `${repo.owner.login}/${repo.name}`;
    const sender = payload.sender || {};

    if (action !== 'closed' || !pr.merged) return [];

    const mergedBy = pr.merged_by || sender;

    const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setAuthor(makeAuthor(mergedBy.login, mergedBy.avatar_url))
        .setTitle(`PR merged: ${repoFull}#${pr.number}`)
        .setURL(pr.html_url)
        .setDescription(pr.title || '')
        .addFields(
            { name: 'Branch', value: `${pr.head?.ref || '?'} → ${pr.base?.ref || '?'}`, inline: true },
            { name: 'Merged by', value: mergedBy.login || 'unknown', inline: true },
        )
        .setTimestamp();

    if (!baseBranch) return [];
    return [{ embed, branch: baseBranch }];
}

function makeAuthor(name, iconURL) {
    const author = { name: name || 'unknown' };
    if (iconURL && typeof iconURL === 'string' && (iconURL.startsWith('http://') || iconURL.startsWith('https://'))) {
        author.iconURL = iconURL;
    }
    return author;
}

async function sendToChannel(channelId, embed) {
    if (!clientInstance) return;

    try {
        const channel = await clientInstance.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(`Failed to send to channel ${channelId}:`, error.message);
    }
}

module.exports = { setupGithubWebhookHandler };
