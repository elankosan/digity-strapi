/**
 * Custom application routes
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/applications/domain/:domain',
      handler: 'custom-application.findByDomain',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/applications/domain/:domain/page/*',
      handler: 'custom-application.findPageByPath',
      config: {
        auth: false,
      },
    },
  ],
};
