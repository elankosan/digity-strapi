#!/usr/bin/env node
/**
 * Strapi Content Populator - Node.js Version
 * Reads a markdown seed data file and populates Strapi CMS via REST API
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Color codes for terminal output
const colors = {
    HEADER: '\x1b[95m',
    OKBLUE: '\x1b[94m',
    OKCYAN: '\x1b[96m',
    OKGREEN: '\x1b[92m',
    WARNING: '\x1b[93m',
    FAIL: '\x1b[91m',
    ENDC: '\x1b[0m',
    BOLD: '\x1b[1m'
};

class StrapiContentPopulator {
    constructor(strapiUrl, apiToken, dryRun = false) {
        this.strapiUrl = strapiUrl.replace(/\/$/, '');
        this.apiToken = apiToken;
        this.dryRun = dryRun;
        this.applicationId = null;
        this.createdPages = {};
    }

    logInfo(message) {
        console.log(`${colors.OKBLUE}ℹ ${message}${colors.ENDC}`);
    }

    logSuccess(message) {
        console.log(`${colors.OKGREEN}✓ ${message}${colors.ENDC}`);
    }

    logWarning(message) {
        console.log(`${colors.WARNING}⚠ ${message}${colors.ENDC}`);
    }

    logError(message) {
        console.log(`${colors.FAIL}✗ ${message}${colors.ENDC}`);
    }

    logHeader(message) {
        console.log(`\n${colors.BOLD}${colors.HEADER}${'='.repeat(60)}${colors.ENDC}`);
        console.log(`${colors.BOLD}${colors.HEADER}${message}${colors.ENDC}`);
        console.log(`${colors.BOLD}${colors.HEADER}${'='.repeat(60)}${colors.ENDC}\n`);
    }

    parseMarkdown(filePath) {
        this.logHeader('Parsing Markdown File');
        this.logInfo(`Reading file: ${filePath}`);

        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract metadata
        const metadata = this.extractKeyValueSection(this.extractSection(content, 'METADATA'));

        // Extract global styles
        const globalStyles = this.extractJsonSection(content, 'GLOBAL STYLES');

        // Extract settings
        const settings = this.extractJsonSection(content, 'SETTINGS');

        // Extract pages
        const pages = this.extractPages(content);

        this.logSuccess(`Parsed ${pages.length} pages from markdown`);

        return { metadata, globalStyles, settings, pages };
    }

    extractSection(content, sectionName) {
        const pattern = new RegExp(`## ${sectionName}\\s*\\n(.*?)(?=\\n## |$)`, 's');
        const match = content.match(pattern);
        return match ? match[1] : '';
    }

    extractKeyValueSection(section) {
        const result = {};
        // Remove code blocks
        section = section.replace(/```.*?```/gs, '');

        section.split('\n').forEach(line => {
            if (line.includes(':') && !line.trim().startsWith('#')) {
                const [key, ...valueParts] = line.split(':');
                result[key.trim().toLowerCase().replace(/\s+/g, '_')] = valueParts.join(':').trim();
            }
        });

        return result;
    }

    extractJsonSection(content, sectionName) {
        const section = this.extractSection(content, sectionName);
        const jsonMatch = section.match(/```json\s*(.*?)\s*```/s);

        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e) {
                this.logError(`Failed to parse JSON in ${sectionName}: ${e.message}`);
                return {};
            }
        }

        return {};
    }

    extractPages(content) {
        const pages = [];
        const pagePattern = /### PAGE: (.*?)\n\n```\n(.*?)\n```/gs;

        let match;
        const matches = [];
        while ((match = pagePattern.exec(content)) !== null) {
            matches.push({ pageName: match[1].trim(), pageHeader: match[2], start: match.index, end: pagePattern.lastIndex });
        }

        matches.forEach((pageMatch, index) => {
            const pageMeta = this.extractKeyValueSection(pageMatch.pageHeader);

            // Extract content blocks for this page
            const pageStart = pageMatch.end;
            const pageEnd = index < matches.length - 1 ? matches[index + 1].start : content.indexOf('\n---', pageStart);
            const pageSection = content.substring(pageStart, pageEnd >= 0 ? pageEnd : content.length);

            const blocks = this.extractBlocks(pageSection);

            pages.push({
                metadata: pageMeta,
                blocks: blocks
            });
        });

        return pages;
    }

    extractBlocks(pageSection) {
        const blocks = [];
        const blockPattern = /\*\*BLOCK \d+: (.*?)\*\*\n\n```\n(.*?)\n```/gs;

        let match;
        while ((match = blockPattern.exec(pageSection)) !== null) {
            const blockName = match[1].trim();
            const blockContent = match[2];

            const blockMeta = this.extractKeyValueSection(blockContent);

            const contentMatch = blockContent.match(/CONTENT:\s*\n({.*?})\s*STYLING:/s);
            const stylingMatch = blockContent.match(/STYLING:\s*\n({.*?})(?:\n|$)/s);

            const blockData = {
                metadata: blockMeta,
                content: {},
                styling: {}
            };

            if (contentMatch) {
                try {
                    blockData.content = JSON.parse(contentMatch[1]);
                } catch (e) {
                    this.logWarning(`Failed to parse content JSON for block: ${blockName}`);
                }
            }

            if (stylingMatch) {
                try {
                    blockData.styling = JSON.parse(stylingMatch[1]);
                } catch (e) {
                    this.logWarning(`Failed to parse styling JSON for block: ${blockName}`);
                }
            }

            blocks.push(blockData);
        }

        return blocks;
    }

    async makeRequest(method, endpoint, data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.strapiUrl + endpoint);
            const options = {
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = http.request(url, options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            resolve({ data: body });
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                    }
                });
            });

            req.on('error', reject);

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    async createApplication(data) {
        this.logHeader('Creating Application');

        const metadata = data.metadata;

        const applicationPayload = {
            data: {
                name: metadata.client_name || 'Unnamed Client',
                domain: metadata.domain || '',
                subdomain: metadata.subdomain || '',
                description: metadata.description || '',
                contactEmail: metadata.contact_email || '',
                active: (metadata.active || 'true').toLowerCase() === 'true',
                globalStyles: data.globalStyles,
                settings: data.settings
            }
        };

        if (this.dryRun) {
            this.logInfo('DRY RUN: Would create application with:');
            console.log(JSON.stringify(applicationPayload, null, 2));
            this.applicationId = 1;
            return true;
        }

        try {
            const result = await this.makeRequest('POST', '/api/applications', applicationPayload);
            this.applicationId = result.data.id;
            this.logSuccess(`Created application (ID: ${this.applicationId})`);
            return true;
        } catch (error) {
            // If application exists, try to find it
            if (error.message.includes('must be unique')) {
                this.logWarning('Application already exists, trying to find it...');
                try {
                    const existingApps = await this.makeRequest('GET', `/api/applications?filters[domain]=${metadata.domain}`);
                    if (existingApps.data && existingApps.data.length > 0) {
                        this.applicationId = existingApps.data[0].id;
                        this.logSuccess(`Found existing application (ID: ${this.applicationId})`);
                        return true;
                    }
                } catch (findError) {
                    this.logError(`Failed to find existing application: ${findError.message}`);
                }
            }
            this.logError(`Failed to create application: ${error.message}`);
            return false;
        }
    }

    async createPages(pages) {
        this.logHeader('Creating Pages');

        for (const pageData of pages) {
            const success = await this.createSinglePage(pageData);
            if (!success) return false;
        }

        return true;
    }

    async createSinglePage(pageData) {
        const metadata = pageData.metadata;
        const blocks = pageData.blocks;

        const pageTitle = metadata.title || 'Untitled Page';

        this.logInfo(`Creating page: ${pageTitle}`);

        const pagePayload = {
            data: {
                title: pageTitle,
                slug: metadata.slug || '',
                path: metadata.path || '/',
                template: metadata.template || 'default',
                metaTitle: metadata.meta_title || '',
                metaDescription: metadata.meta_description || '',
                metaKeywords: metadata.meta_keywords || '',
                showInNavigation: (metadata.visible || 'true').toLowerCase() === 'true',
                application: this.applicationId
            }
        };

        let pageId;
        if (this.dryRun) {
            this.logInfo(`DRY RUN: Would create page: ${pageTitle}`);
            pageId = Object.keys(this.createdPages).length + 1;
        } else {
            try {
                const result = await this.makeRequest('POST', '/api/pages', pagePayload);
                pageId = result.data.id;
            } catch (error) {
                // If page exists, try to find it
                if (error.message.includes('must be unique')) {
                    this.logWarning(`Page ${pageTitle} already exists, trying to find it...`);
                    try {
                        const existingPages = await this.makeRequest('GET', `/api/pages?filters[slug]=${metadata.slug}&filters[application]=${this.applicationId}`);
                        if (existingPages.data && existingPages.data.length > 0) {
                            pageId = existingPages.data[0].id;
                            this.logSuccess(`Found existing page: ${pageTitle} (ID: ${pageId})`);
                        } else {
                            throw new Error(`Could not find existing page with slug ${metadata.slug}`);
                        }
                    } catch (findError) {
                        this.logError(`Failed to find existing page: ${findError.message}`);
                        return false;
                    }
                } else {
                    this.logError(`Failed to create page ${pageTitle}: ${error.message}`);
                    return false;
                }
            }
        }

        this.createdPages[pageTitle] = pageId;
        this.logSuccess(`Created page: ${pageTitle} (ID: ${pageId})`);

        // Create content blocks
        for (const blockData of blocks) {
            const success = await this.createContentBlock(pageId, blockData);
            if (!success) return false;
        }

        return true;
    }

    async createContentBlock(pageId, blockData) {
        const metadata = blockData.metadata;

        const blockType = metadata.block_type || 'unknown';
        const order = parseInt(metadata.order || '0');

        const blockPayload = {
            data: {
                blockType: blockType,
                content: blockData.content || {},
                styling: blockData.styling || {},
                order: order,
                visible: (metadata.visible || 'true').toLowerCase() === 'true',
                page: pageId
            }
        };

        if (this.dryRun) {
            this.logInfo(`  DRY RUN: Would create ${blockType} block (order: ${order})`);
            return true;
        }

        try {
            const result = await this.makeRequest('POST', '/api/content-blocks', blockPayload);
            const blockId = result.data.id;
            this.logSuccess(`  Created ${blockType} block (ID: ${blockId})`);
            return true;
        } catch (error) {
            this.logError(`Failed to create ${blockType} block: ${error.message}`);
            return false;
        }
    }

    async populate(markdownFile) {
        try {
            // Parse markdown
            const data = this.parseMarkdown(markdownFile);

            // Create application
            if (!await this.createApplication(data)) {
                return false;
            }

            // Create pages and blocks
            if (!await this.createPages(data.pages)) {
                return false;
            }

            this.logHeader('Population Complete');
            this.logSuccess(`Successfully populated ${data.pages.length} pages`);

            return true;
        } catch (error) {
            this.logError(`Unexpected error: ${error.message}`);
            console.error(error);
            return false;
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error('Usage: node strapi_content_populator.js <markdown_file> <strapi_url> <api_token> [--dry-run]');
        process.exit(1);
    }

    const [markdownFile, strapiUrl, apiToken] = args;
    const dryRun = args.includes('--dry-run');

    if (!fs.existsSync(markdownFile)) {
        console.error(`${colors.FAIL}Error: File not found: ${markdownFile}${colors.ENDC}`);
        process.exit(1);
    }

    const populator = new StrapiContentPopulator(strapiUrl, apiToken, dryRun);
    const success = await populator.populate(markdownFile);

    process.exit(success ? 0 : 1);
}

main();
