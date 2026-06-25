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
    if (!Buffer.isBuffer(payload) || !signature) return false;

    const expected = `sha256=${crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex')}`;

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function startWebhookServer() {
    const app = express();

    // Capture the raw body for ANY content-type so we can verify the GitHub
    // signature (computed over the exact bytes) and support both
    // application/json and application/x-www-form-urlencoded deliveries.
    app.use(express.raw({ type: '*/*', limit: '25mb' }));

    app.post('/github', async (req, res) => {
      try {
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

        if (WEBHOOK_SECRET) {
            const signature = req.headers['x-hub-signature-256'];
            if (!verifySignature(rawBody, signature)) {
                console.warn('GitHub webhook: invalid signature');
                return res.status(401).send('Unauthorized');
            }
        }

        // GitHub sends either raw JSON or a urlencoded `payload=<json>` field.
        const contentType = req.headers['content-type'] || '';
        let payload;
        try {
            if (contentType.includes('application/x-www-form-urlencoded')) {
                const form = new URLSearchParams(rawBody.toString('utf8'));
                payload = JSON.parse(form.get('payload') || '{}');
            } else {
                payload = JSON.parse(rawBody.toString('utf8') || '{}');
            }
        } catch (err) {
            console.warn('GitHub webhook: unparseable payload:', err.message);
            return res.status(400).send('Bad payload');
        }

        const event = req.headers['x-github-event'];

        if (!payload || !payload.repository) {
            return res.send('OK');
        }

        const owner = payload.repository.owner?.login || payload.repository.owner?.name;
        const repo = payload.repository.name;

        const watches = await getWatches();

        const repoMatches = [];
        for (const [, guildWatches] of Object.entries(watches)) {
            if (!Array.isArray(guildWatches)) continue;
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
      } catch (err) {
        console.error('GitHub webhook handler error:', err);
        if (!res.headersSent) res.status(500).send('Internal error');
      }
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
