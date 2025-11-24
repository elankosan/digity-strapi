import crypto from 'crypto';
// import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    // Generate API keys for applications that don't have one
    const applications = await strapi.db.query('api::application.application').findMany({
      where: { apiKey: null }
    });

    for (const app of applications) {
      const apiKey = crypto.randomBytes(32).toString('hex');
      await strapi.db.query('api::application.application').update({
        where: { id: app.id },
        data: { apiKey }
      });
      strapi.log.info(`Generated API key for application: ${app.name}`);
    }
  },
};
