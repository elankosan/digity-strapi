
const { createStrapi } = require('@strapi/strapi');

async function fixRelations() {
  const strapi = await createStrapi({ distDir: '/app/dist' }).load();
  
  try {
    // Define the mapping of Slug -> Block IDs
    const pageMappings = {
      'home': [1, 2, 3, 4, 5],
      'services': [6, 7, 8, 9, 10],
      'about-us': [11, 12, 13],
      'testimonials': [14, 15, 16, 17, 18],
      'contact-us': [19, 20, 21]
    };

    for (const [slug, blockIds] of Object.entries(pageMappings)) {
      console.log(`Fixing page: ${slug} with blocks: ${blockIds.join(', ')}`);
      
      // Find the page (Draft or Published)
      // In Strapi v5, we should use the Document Service to update the document.
      const pages = await strapi.documents('api::page.page').findMany({
        filters: { slug: slug },
        status: 'draft' // Find the draft version to update
      });

      if (pages.length === 0) {
        console.log(`  Page not found: ${slug}`);
        continue;
      }

      const page = pages[0];
      console.log(`  Found Page Document ID: ${page.documentId} (ID: ${page.id})`);

      // Update the page to attach the blocks
      await strapi.documents('api::page.page').update({
        documentId: page.documentId,
        data: {
          contentBlocks: blockIds
        },
        status: 'draft'
      });
      
      console.log(`  Updated Draft.`);

      // Also publish it to make it live
      await strapi.documents('api::page.page').publish({
        documentId: page.documentId
      });
      
      console.log(`  Published.`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    strapi.stop();
  }
}

fixRelations();
