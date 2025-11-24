/**
 * Custom application controller
 * Provides endpoints for fetching application data by domain
 */

export default {
  async findByDomain(ctx) {
    try {
      const { domain } = ctx.params;
      
      if (!domain) {
        return ctx.badRequest('Domain parameter is required');
      }

      const application = await strapi.db.query('api::application.application').findOne({
        where: { domain },
        populate: {
          logo: true,
          favicon: true,
          pages: {
            where: { publishedAt: { $notNull: true } },
            populate: {
              ogImage: true,
              contentBlocks: {
                where: { visible: true },
                orderBy: { order: 'asc' }
              }
            },
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!application) {
        return ctx.notFound('Application not found');
      }

      if (!application.active) {
        return ctx.forbidden('Application is not active');
      }

      return application;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findPageByPath(ctx) {
    try {
      const { domain, path } = ctx.params;
      
      if (!domain || !path) {
        return ctx.badRequest('Domain and path parameters are required');
      }

      // First find the application
      const application = await strapi.db.query('api::application.application').findOne({
        where: { domain }
      });

      if (!application || !application.active) {
        return ctx.notFound('Application not found or not active');
      }

      // Find the page by path
      const page = await strapi.db.query('api::page.page').findOne({
        where: { 
          application: { id: application.id },
          path: path === '' ? '/' : path,
          publishedAt: { $notNull: true }
        },
        populate: {
          ogImage: true,
          contentBlocks: {
            where: { visible: true },
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!page) {
        return ctx.notFound('Page not found');
      }

      return {
        application: {
          id: application.id,
          name: application.name,
          globalStyles: application.globalStyles,
          settings: application.settings
        },
        page
      };
    } catch (err) {
      ctx.throw(500, err);
    }
  }
};
