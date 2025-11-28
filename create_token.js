
const strapi = require('@strapi/strapi');

async function createToken() {
    try {
        // Initialize Strapi
        const app = await strapi().load();

        // Check if token already exists
        const tokenService = app.service('admin::api-token');
        const existingToken = await tokenService.exists({ name: 'Content Population Token' });

        if (existingToken) {
            console.log('Token already exists. Revoking and recreating...');
            const tokens = await tokenService.list();
            const tokenToDelete = tokens.find(t => t.name === 'Content Population Token');
            if (tokenToDelete) {
                await tokenService.revoke(tokenToDelete.id);
            }
        }

        // Create new token
        const token = await tokenService.create({
            name: 'Content Population Token',
            type: 'full-access',
            description: 'Token for content population script',
            lifespan: null // Unlimited
        });

        console.log('TOKEN_GENERATED:' + token.accessKey);
        process.exit(0);
    } catch (error) {
        console.error('Error creating token:', error);
        process.exit(1);
    }
}

createToken();
