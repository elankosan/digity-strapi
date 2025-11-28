
const { createStrapi } = require('@strapi/strapi');

async function countBlocks() {
  const strapi = await createStrapi({ distDir: '/app/dist' }).load();
  
  try {
    const blocks = await strapi.entityService.findMany('api::content-block.content-block');
    console.log(`Total Content Blocks in DB: ${blocks.length}`);
    for (const block of blocks) {
        console.log(`Block ID: ${block.id}, Type: ${block.blockType}`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    strapi.stop();
  }
}

countBlocks();
