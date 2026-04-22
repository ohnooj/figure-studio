/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "features-not-to-app-hooks",
      severity: "error",
      from: {
        path: "^src/features/.+",
      },
      to: {
        path: "^src/app/hooks/.+",
      },
    },
    {
      name: "shared-not-to-features",
      severity: "error",
      from: {
        path: "^src/shared/.+",
      },
      to: {
        path: "^src/features/.+",
      },
    },
  ],
  options: {
    tsConfig: {
      fileName: "tsconfig.json",
    },
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "dist",
    },
  },
};
