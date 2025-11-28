const { createStrapi } = require('@strapi/strapi');

async function deduplicate() {
  // Initialize Strapi
  const strapi = await createStrapi({ distDir: './dist' }).load();

  try {
    console.log('Starting deduplication process...');

    // 1. Find the SMW Application
    const apps = await strapi.db.query('api::application.application').findMany({
      where: { domain: 'stage.smwwoodwork.ca' },
    });

    if (apps.length === 0) {
      console.log('SMW Application not found.');
      return;
    }

    const app = apps[0];
    console.log(`Found Application: ${app.name} (ID: ${app.id})`);

    // 2. Get all pages for this application
    const pages = await strapi.db.query('api::page.page').findMany({
      where: { application: app.id },
      populate: ['contentBlocks'],
    });

    console.log(`Found ${pages.length} pages.`);

    for (const page of pages) {
      console.log(`Processing Page: ${page.title} (ID: ${page.id})`);
      
      const blocks = page.contentBlocks;
      if (!blocks || blocks.length === 0) {
        console.log('  No content blocks found.');
        continue;
      }
      
      console.log(`  Block IDs: ${blocks.map(b => b.id).join(', ')}`);
    }

    console.log('Deduplication finished successfully.');

  } catch (error) {
    console.error('Error during deduplication:', error);
  } finally {
    // Stop Strapi
    strapi.stop();
  }
}

deduplicate();
