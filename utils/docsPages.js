const fs = require('fs');
const path = require('path');

const DOCS_SOURCE_DIR = process.env.DOCS_SOURCE_DIR
    || path.join(__dirname, '..', '..', 'noctalia-docs', 'src', 'content', 'docs', 'noctalia');

function getSiteBaseUrl() {
    const base = process.env.DOCS_SITE_URL || 'https://docs.noctalia.dev';
    return base.endsWith('/') ? base.slice(0, -1) : base;
}

let pagesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 1000 * 60 * 30;

function humanize(segment) {
    return segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function getOgImageUrl(rawSlug) {
    const ogPath = rawSlug ? `/og/docs/noctalia/${rawSlug}.webp` : '/og/docs/noctalia.webp';
    return `${getSiteBaseUrl()}${ogPath}`;
}

function extractTitle(fileContent, fallback) {
    const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return fallback;

    const titleMatch = frontmatterMatch[1].match(/^title:\s*(.+)$/m);
    if (!titleMatch) return fallback;

    return titleMatch[1].trim().replace(/^["']|["']$/g, '');
}

function walkDir(dir, baseDir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(fullPath, baseDir, files);
        } else if (/\.mdx?$/.test(entry.name)) {
            files.push(fullPath);
        }
    }

    return files;
}

function buildPageFromFile(filePath) {
    const relativePath = path.relative(DOCS_SOURCE_DIR, filePath);
    const withoutExt = relativePath.replace(/\.mdx?$/, '').replace(/\\/g, '/');
    const slug = withoutExt === 'index' ? '' : withoutExt.replace(/\/index$/, '');

    const content = fs.readFileSync(filePath, 'utf-8');
    const fallbackTitle = humanize((slug.split('/').pop() || slug));
    const title = extractTitle(content, fallbackTitle);

    const segments = slug.split('/').filter(Boolean);
    const sectionSegment = segments[0] || 'general';
    const section = humanize(sectionSegment);

    const breadcrumb = segments.slice(0, -1).map(humanize).join(' > ');
    const displayName = breadcrumb ? `${breadcrumb} > ${title}` : title;

    const url = slug
        ? `${getSiteBaseUrl()}/noctalia/${slug}/`
        : `${getSiteBaseUrl()}/noctalia/`;

    return {
        title,
        slug: slug || 'index',
        section,
        displayName,
        url,
        ogImage: getOgImageUrl(slug),
    };
}

function scanDocsPages() {
    if (!fs.existsSync(DOCS_SOURCE_DIR)) {
        console.warn(`Docs source directory not found: ${DOCS_SOURCE_DIR}`);
        return [];
    }

    try {
        const files = walkDir(DOCS_SOURCE_DIR, DOCS_SOURCE_DIR);
        return files.map(buildPageFromFile).sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
        console.error('Error scanning docs pages:', error.message);
        return [];
    }
}

async function getDocsPages() {
    const now = Date.now();

    if (pagesCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
        return pagesCache;
    }

    const pages = scanDocsPages();

    if (pages.length > 0) {
        pagesCache = pages;
        cacheTimestamp = now;
        return pages;
    }

    // Scan failed/empty - fall back to a stale cache rather than nothing, if we have one
    return pagesCache || [];
}

function refreshDocsPages() {
    pagesCache = null;
    cacheTimestamp = null;
    return getDocsPages();
}

async function searchDocsPages(query, limit = 25) {
    const pages = await getDocsPages();
    const normalizedQuery = (query || '').trim().toLowerCase();

    if (!normalizedQuery) {
        return pages.slice(0, limit);
    }

    const startsWith = [];
    const includes = [];

    for (const page of pages) {
        const title = page.title.toLowerCase();
        const slug = page.slug.toLowerCase();
        const displayName = page.displayName.toLowerCase();

        if (title.startsWith(normalizedQuery) || slug.startsWith(normalizedQuery)) {
            startsWith.push(page);
        } else if (title.includes(normalizedQuery) || slug.includes(normalizedQuery) || displayName.includes(normalizedQuery)) {
            includes.push(page);
        }
    }

    return [...startsWith, ...includes].slice(0, limit);
}

module.exports = {
    getDocsPages,
    searchDocsPages,
    refreshDocsPages,
    getOgImageUrl,
};
