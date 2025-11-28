
const { createStrapi } = require('@strapi/strapi');

async function listPages() {
  const strapi = await createStrapi({ distDir: '/app/dist' }).load();
  
  try {
    const pages = await strapi.entityService.findMany('api::page.page', {
      filters: {
        application: 3
      },
      populate: ['contentBlocks']
    });

    console.log(`Found ${pages.length} pages for App ID 3:`);
    for (const page of pages) {
      console.log(`Page ID: ${page.id}, DocumentID: ${page.documentId}, Title: ${page.title}, Slug: ${page.slug}, Path: ${page.path}`);
      console.log(`  PublishedAt: ${page.publishedAt}`);
      console.log(`  Content Blocks: ${page.contentBlocks ? page.contentBlocks.length : 0}`);
      if (page.contentBlocks) {
        console.log(`  Block IDs: ${page.contentBlocks.map(b => b.id).join(', ')}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    strapi.stop();
  }
}

listPages();
