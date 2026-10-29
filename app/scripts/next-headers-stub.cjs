// Stands in for next/headers when a self-test calls a route that reads cookies.
// The test sets globalThis.__testCookies = { name: value }.
module.exports = {
  cookies: async () => ({
    get: (name) => {
      const jar = globalThis.__testCookies || {};
      return name in jar ? { name, value: jar[name] } : undefined;
    },
  }),
  headers: async () => new Headers(),
};
